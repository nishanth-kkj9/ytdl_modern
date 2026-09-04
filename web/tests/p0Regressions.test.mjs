import assert from "node:assert";
import { EventEmitter } from "node:events";
import net from "node:net";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

import { EngineManager } from "../services/engineManager.mjs";
import { historyService as realService } from "../services/historyService.mjs";

// P0 regression pins. These behaviors were fixed in 65f9c9f but had no tests
// — a future refactor could silently reintroduce them. Each test mirrors the
// original failure mode end-to-end or at the exact seam where it lived.

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

async function makeService() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdl-p0reg-"));
  const file = path.join(dir, "history.json");
  // Same reconstruction trick as historyService.test.mjs: the module exports
  // a singleton, so build a fresh instance from its constructor.
  const ServiceCtor = Object.getPrototypeOf(realService).constructor;
  const svc = new ServiceCtor(file);
  await svc.init();
  return { svc, file, dir };
}

// ── P0-4: recover() with a LIVE child must retire it, not orphan it ──────────

{
  const bus = makeBus();
  const mgr = new EngineManager(bus);

  const killed = [];
  const oldChild = { kill: () => killed.push(1) };
  mgr.child = oldChild;
  mgr.stdin = {};
  mgr.ready = true;
  mgr.fatalError = true;
  mgr.restartAttempts = 3;

  let spawned = 0;
  mgr.spawn = () => {
    spawned += 1;
  };

  const crashed = collect(bus, "engine_crashed");
  mgr.recover();

  assert.strictEqual(killed.length, 1, "recover() must kill the live child first");
  assert.strictEqual(mgr.child, null, "child slot must be cleared");
  assert.strictEqual(mgr.stdin, null, "stdin slot must be cleared");
  assert.strictEqual(mgr.fatalError, false, "recover() resets the fatal flag");
  assert.strictEqual(mgr.restartAttempts, 0, "recover() resets the restart budget");
  assert.strictEqual(spawned, 1, "recover() spawns exactly one replacement");

  // The old child's exit event fires ASYNCHRONOUSLY — by then `stopping` is
  // false again, so only the retirement marker can stop it from being
  // misread as a fresh crash (ghost engine + respawn storm).
  assert.strictEqual(mgr.stopping, false, "stopping flag is already reset");
  mgr._onChildExit(oldChild, null, "SIGTERM");
  assert.strictEqual(crashed.length, 0, "retired child's exit must not broadcast engine_crashed");
  assert.strictEqual(mgr.retiredChildren.size, 0, "retirement marker must be consumed exactly once");

  // Sanity: a NON-retired child's exit still takes the crash path.
  const otherChild = { kill: () => {} };
  const crashed2 = collect(bus, "engine_crashed");
  mgr._onChildExit(otherChild, 1, null);
  assert.strictEqual(crashed2.length, 1, "a genuine crash must still broadcast");

  console.log("✓ P0-4 recover() retires the live child without a ghost engine");
}

// ── P0-5: a failed clear() must not poison the write queue ───────────────────

{
  const { svc, file } = await makeService();
  await svc.saveRecord({ id: "a", title: "A" });

  // Fail exactly one write (the clear), then restore the real writer.
  const realWrite = svc._writeFile.bind(svc);
  let failNext = true;
  svc._writeFile = (data) => {
    if (failNext) {
      failNext = false;
      return Promise.reject(Object.assign(new Error("EACCES simulated"), { code: "EACCES" }));
    }
    return realWrite(data);
  };

  await assert.rejects(() => svc.clear(), "clear() must surface the failure to the caller");

  // Restore — the NEXT save must hit the disk (old code: chained onto the
  // rejected queue forever, silently losing every subsequent record).
  svc._writeFile = realWrite;
  await svc.saveRecord({ id: "b", title: "B" });

  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  assert.strictEqual(parsed.length, 2, "post-failure record must be persisted");
  assert.strictEqual(parsed[0].id, "b", "newest record first");
  // Memory and disk must agree (the save commits only after a successful write).
  const memory = await svc.loadHistory();
  assert.deepStrictEqual(memory, parsed, "memory must match disk after recovery");

  await fs.rm(path.dirname(file), { recursive: true, force: true });
  console.log("✓ P0-5 clear() failure no longer poisons the write queue");
}

// ── P0-1: a WebSocket receiver error must not kill the server ────────────────

{
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdl-p0ws-"));
  const port = 21000 + (process.pid % 20000);
  const server = spawn(
    process.execPath,
    ["server.mjs"],
    {
      cwd: path.join(process.cwd()),
      stdio: "ignore",
      env: {
        ...process.env,
        PORT: String(port),
        YTDL_DATA_DIR: dataDir,
        // Keep the test hermetic: a bogus interpreter exercises the spawn
        // failure path (bounded restarts → fatal) without a real sidecar.
        PYTHON: "definitely-not-a-python",
      },
    }
  );

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  async function healthy() {
    try {
      const res = await fetch(healthUrl);
      return res.ok;
    } catch {
      return false;
    }
  }

  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) {
      up = await healthy();
      if (!up) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(up, "server must become healthy before the WS probe");

    // Complete a real upgrade handshake, then send a protocol-violating
    // frame (RSV1 set on a data frame AND no masking — both hard receiver
    // errors). Without the socket 'error' handler this is an
    // uncaughtException → process.exit → the health check below fails.
    await new Promise((resolve, reject) => {
      const sock = net.connect(port, "127.0.0.1");
      const key = Buffer.from("dGhlIHNhbXBsZSBub25jZQ==").toString(); // RFC 6455 sample
      const handshake =
        `GET /ws HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`;
      let buf = "";
      sock.setEncoding("utf8");
      sock.on("data", (chunk) => {
        buf += chunk;
        if (buf.includes("101")) {
          // Handshake done — now the hostile frame: FIN|RSV1|binary, no mask.
          sock.write(Buffer.from([0xc2, 0x00]));
          // Give the server a beat to (not) crash, then hang up.
          setTimeout(() => {
            sock.destroy();
            resolve();
          }, 400);
        }
      });
      sock.on("error", () => {
        // Expected: the FIXED server terminates the hostile socket, which
        // surfaces here as ECONNRESET. Never treat that as a test failure —
        // the health checks below are what detect a dead server.
      });
      sock.write(handshake);
      setTimeout(() => resolve(), 2000); // don't hang if 101 never arrives
    });

    await new Promise((r) => setTimeout(r, 600));
    assert.ok(await healthy(), "server must survive a hostile WS frame");

    // A well-behaved client must still be able to connect and receive the
    // synthetic engine_ready broadcast.
    const gotReady = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, 3000);
      ws.on("message", (data) => {
        try {
          if (JSON.parse(data.toString()).type === "engine_ready") {
            clearTimeout(timer);
            ws.close();
            resolve(true);
          }
        } catch {
          /* ignore */
        }
      });
      ws.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    assert.ok(gotReady, "normal WS clients must still work after the hostile frame");

    console.log("✓ P0-1 server survives a hostile WebSocket frame");
  } finally {
    server.kill();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}