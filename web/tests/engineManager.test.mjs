import assert from "node:assert";
import { EventEmitter } from "node:events";
import { EngineManager } from "../services/engineManager.mjs";

function makeBus() {
  const bus = new EventEmitter();
  bus.emit = bus.emit.bind(bus);
  return bus;
}

function collect(bus, event) {
  const events = [];
  bus.on(event, (e) => events.push(e));
  return events;
}

// Test 1: queued commands get terminal error when restart budget exhausted
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);

  // Simulate: engine not ready (no stdin)
  mgr.child = {};
  mgr.stdin = null;
  mgr.ready = false;

  mgr.sendCommand({ cmd: "download", id: "req-1", url: "https://example.com" });
  mgr.sendCommand({ cmd: "probe", id: "req-2", url: "https://example.com" });

  assert.strictEqual(mgr.pendingCommands.length, 2, "Commands should be queued");

  const fatalErrors = collect(bus, "fatal_error");
  const errors = collect(bus, "error");

  mgr.restartAttempts = 3;
  mgr.maybeRestart();

  assert.strictEqual(fatalErrors.length, 1, "Should emit one fatal_error");
  assert.strictEqual(mgr.pendingCommands.length, 0, "Pending should be cleared");

  const req1Error = errors.find((e) => e.id === "req-1");
  const req2Error = errors.find((e) => e.id === "req-2");
  assert.ok(req1Error, "req-1 should get a terminal error event");
  assert.ok(req2Error, "req-2 should get a terminal error event");
  assert.strictEqual(req1Error.error_type, "EngineFatalError");
  assert.strictEqual(req2Error.error_type, "EngineFatalError");
}

// Test 2: sendCommand throws when already in fatalError state
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.fatalError = true;

  assert.throws(
    () => mgr.sendCommand({ cmd: "download", id: "req-3" }),
    /fatal error/,
    "sendCommand should throw in fatal state"
  );
}

// Test 3: no terminal errors emitted when pending is empty
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.restartAttempts = 3;
  const errors = collect(bus, "error");
  mgr.maybeRestart();
  assert.strictEqual(errors.length, 0, "No errors when pending is empty");
}

// Test 4: recover() resets the fatal flag and respawns the engine
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.fatalError = true;
  mgr.restartAttempts = 3;
  // Prevent an actual spawn during the unit test.
  let spawned = false;
  mgr.spawn = () => {
    spawned = true;
  };
  mgr.recover();
  assert.strictEqual(mgr.fatalError, false, "recover() should clear fatalError");
  assert.strictEqual(mgr.restartAttempts, 0, "recover() should reset restart attempts");
  assert.strictEqual(spawned, true, "recover() should respawn the engine");
  assert.doesNotThrow(
    () => mgr.sendCommand({ cmd: "probe", id: "req-4", url: "https://example.com" }),
    "sendCommand should work after recover()"
  );
}

// Test 5: pending queue is bounded (backlog cap)
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.child = {};
  mgr.stdin = null;
  mgr.ready = false;
  mgr.maxPendingCommands = 2;
  mgr.sendCommand({ cmd: "probe", id: "p-1" });
  mgr.sendCommand({ cmd: "probe", id: "p-2" });
  // Third queued command should throw because the backlog is full.
  assert.throws(
    () => mgr.sendCommand({ cmd: "probe", id: "p-3" }),
    /backlog full/,
    "Third queued command should be rejected when the cap is reached"
  );
  assert.strictEqual(mgr.pendingCommands.length, 2, "No more than the cap should be queued");
}

// Test 6: a spawn error routes into the same bounded-restart mechanism that a
// crash uses, so the engine is not left permanently "starting". Here we verify
// maybeRestart counts attempts (which the child.on("error") handler now calls).
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.restartAttempts = 0;
  mgr.stdin = null;
  mgr.ready = false;
  // Stub spawn so the 500ms retry timer cannot launch a real child process.
  mgr.spawn = () => {};
  const warnings = collect(bus, "engine_crashed");
  // Emulate what spawn()'s child.on("error") now does: mark down and restart.
  mgr.ready = false;
  mgr.maybeRestart();
  assert.strictEqual(mgr.restartAttempts, 1, "spawn/child error should trigger a restart attempt");
  assert.strictEqual(warnings.length, 0, "crashes not emitted by a spawn error path");
}

// Test 7: requestJobs resolves [] immediately when the engine is down
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.child = null;
  mgr.stdin = null;
  const jobs = await mgr.requestJobs(50);
  assert.deepStrictEqual(jobs, []);
  assert.strictEqual(mgr.pendingJobRequests.size, 0, "down engine should not register a pending request");
}

// Test 8: requestJobs resolves with the engine's jobs_result reply
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.child = {};
  mgr.stdin = { destroyed: false };
  let sent = null;
  mgr._writeCommand = (cmd) => {
    sent = cmd;
  };
  const promise = mgr.requestJobs(500);
  assert.ok(sent && sent.cmd === "jobs", "requestJobs should send a jobs command");
  assert.ok(String(sent.request_id).startsWith("jobs-"), "request_id should be namespaced");
  mgr.handleEngineMessage({
    type: "jobs_result",
    request_id: sent.request_id,
    jobs: [{ id: "a", status: "running" }],
  });
  const jobs = await promise;
  assert.deepStrictEqual(jobs, [{ id: "a", status: "running" }]);
}

// Test 9: requestJobs times out to [] when the engine never replies
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.child = {};
  mgr.stdin = { destroyed: false };
  mgr._writeCommand = () => {};
  const jobs = await mgr.requestJobs(30);
  assert.deepStrictEqual(jobs, []);
  assert.strictEqual(mgr.pendingJobRequests.size, 0, "timeout should clean up the pending map");
}

// Test 10: stop() releases in-flight jobs queries with []
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.child = { kill: () => {} };
  mgr.stdin = { destroyed: false };
  mgr._writeCommand = () => {};
  const promise = mgr.requestJobs(5000);
  mgr.stop();
  assert.deepStrictEqual(await promise, []);
}

// Test 11: engine_ready preserves additive Python dependency flags while old
// payloads without them remain safe to consume.
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.handleEngineMessage({
    type: "engine_ready",
    ffmpeg: true,
    ffprobe: true,
    deno: false,
    yt_dlp: true,
    mutagen: false,
  });
  assert.deepStrictEqual(mgr.getTools(), {
    ffmpeg: true, ffprobe: true, deno: false, yt_dlp: true, mutagen: false,
  });

  const legacy = new EngineManager(makeBus());
  legacy.handleEngineMessage({ type: "engine_ready", ffmpeg: true });
  assert.doesNotThrow(() => legacy.getTools());
  assert.deepStrictEqual(legacy.getTools(), {
    ffmpeg: true, ffprobe: false, deno: false, yt_dlp: false, mutagen: false,
  });
}
// Test 12 (PR-03): tool availability must not survive engine death — stale
// ffmpeg/yt_dlp flags in /api/status would misreport a dead engine's state.
// Follows Test 6's convention: emulate the child exit handler path without
// spawning a real child process (the real handlers delegate to
// _onChildExit, verified by inspection of spawn()'s wiring).
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.handleEngineMessage({
    type: "engine_ready", ffmpeg: true, ffprobe: true, deno: true, yt_dlp: true, mutagen: true,
  });
  mgr.child = { kill: () => {} };
  mgr.stdin = { destroyed: false };
  assert.notStrictEqual(mgr.getTools(), null, "tools should be set while engine is ready");
  mgr.spawn = () => {}; // stub the auto-restart timer's spawn

  const crashes = collect(bus, "engine_crashed");
  mgr._onChildExit(1, null);
  assert.strictEqual(mgr.readyTools, null, "tools must be cleared when the engine exits");
  assert.strictEqual(mgr.ready, false, "engine must be marked not-ready on exit");
  assert.strictEqual(crashes.length, 1, "non-zero exit should emit engine_crashed");

  // Zero exit (clean stop) also clears tools but must not emit a crash.
  const bus2 = makeBus();
  const mgr2 = new EngineManager(bus2);
  mgr2.handleEngineMessage({ type: "engine_ready", ffmpeg: true });
  const crashes2 = collect(bus2, "engine_crashed");
  mgr2.spawn = () => {};
  mgr2._onChildExit(0, null);
  assert.strictEqual(mgr2.readyTools, null, "tools must be cleared on clean exit too");
  assert.strictEqual(crashes2.length, 0, "clean exit must not emit engine_crashed");
}

// Test 12b (IPC versioning): the engine advertises its NDJSON protocol
// version in engine_ready; Node warns via the bus when it mismatches so a
// stale Python engine paired with a newer server is visible, never silent.
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  const logs = collect(bus, "engine_log");
  mgr.handleEngineMessage({
    type: "engine_ready", protocol_version: 1, ffmpeg: true,
  });
  assert.strictEqual(logs.length, 0, "matching protocol version must not warn");
  assert.strictEqual(mgr.ready, true);

  const bus2 = makeBus();
  const mgr2 = new EngineManager(bus2);
  const logs2 = collect(bus2, "engine_log");
  mgr2.handleEngineMessage({
    type: "engine_ready", protocol_version: 99, ffmpeg: true,
  });
  assert.strictEqual(mgr2.ready, true, "engine still becomes ready on version mismatch");
  assert.strictEqual(logs2.length, 1, "mismatched protocol version must warn once");
  assert.match(logs2[0].message, /protocol version/i);
}

// Legacy engines (pre-versioning) that omit protocol_version must not crash
// or warn — additive field, old payloads stay valid.
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  const logs = collect(bus, "engine_log");
  mgr.handleEngineMessage({ type: "engine_ready", ffmpeg: true });
  assert.strictEqual(mgr.ready, true);
  assert.strictEqual(logs.length, 0, "missing protocol_version (legacy) must not warn");
}

console.log("All engineManager tests passed.");
