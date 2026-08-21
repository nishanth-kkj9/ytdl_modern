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

console.log("All engineManager tests passed.");
