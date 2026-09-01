import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { config } from "../config.mjs";

/**
 * engineManager.mjs — manages the Python engine child process.
 *
 * Responsibilities:
 *   - Spawn the Python sidecar (python-engine/ipc_main.py)
 *   - Bridge NDJSON stdin/stdout to an EventBus
 *   - Route command messages to the engine
 *   - Auto-restart on crash (bounded)
 *
 * The engine is decoupled from the WebSocket layer via the EventBus, so any
 * new consumer (logs, metrics, multiple sessions) can subscribe without
 * modifying this module.
 */
export class EngineManager {
  constructor(eventBus) {
    this.bus = eventBus;
    this.child = null;
    this.stdin = null;
    this.restartAttempts = 0;
    this.ready = false;
    this.fatalError = false;
    this.pendingCommands = [];
    // Cap the pending queue so a burst of commands (or a long engine outage)
    // cannot grow memory unboundedly (mirrors the history 100-record cap).
    this.maxPendingCommands = config.engineMaxPendingCommands;
    // In-flight `jobs` queries awaiting a jobs_result reply, keyed by
    // request_id. Each entry carries its timeout so a dead engine can't
    // leave callers hanging.
    this.pendingJobRequests = new Map();
    this._jobRequestSeq = 0;
    // Last engine_ready payload — surfaces ffmpeg/ffprobe/deno availability.
    this.readyTools = null;
  }

  start() {
    this.spawn();
  }

  // Reset a fatal-error state and respawn the engine. Used to recover from
  // a terminal crash without restarting the whole server.
  recover() {
    this.fatalError = false;
    this.restartAttempts = 0;
    this.ready = false;
    this.pendingCommands = [];
    this._failPendingJobRequests();
    this.spawn();
    return true;
  }

  spawn() {
    this.fatalError = false;
    const pythonExe = process.env.PYTHON || "python";
    const args = [config.engineEntry];
    const child = spawn(pythonExe, args, {
      cwd: config.engineCwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.stdin = child.stdin;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        this.bus.emit("engine_log", { type: "engine_log", message: trimmed });
        return;
      }
      this.handleEngineMessage(msg);
    });

    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        this.bus.emit("engine_log", { type: "engine_log", message: trimmed });
      }
    });

    child.on("error", (err) => {
      this.ready = false;
      this.child = null;
      this.stdin = null;
      this.bus.emit("engine_error", { error: `Engine spawn failed: ${err.message}` });
      // Treat a spawn failure like a crash so the bounded-restart logic can
      // recover (e.g. when Python is temporarily unavailable) instead of
      // leaving the engine stuck in a permanent "starting" state.
      this.maybeRestart();
    });

    child.on("exit", (code, signal) => {
      this.ready = false;
      this.child = null;
      this.stdin = null;
      if (code !== 0) {
        this.bus.emit("engine_crashed", { exit_code: code, signal });
        this.maybeRestart();
      }
    });
  }

  handleEngineMessage(msg) {
    switch (msg.type) {
      case "engine_ready":
        this.ready = true;
        this.restartAttempts = 0;
        this.readyTools = {
          ffmpeg: Boolean(msg.ffmpeg),
          ffprobe: Boolean(msg.ffprobe),
          deno: Boolean(msg.deno),
        };
        this.bus.emit("engine_ready", msg);
        // Flush any commands that were queued while the engine was starting.
        this.flushPending();
        break;
      case "jobs_result": {
        // Resolve the matching requestJobs() promise (never forwarded to the
        // bus — this is a point-to-point reply, not a broadcast event).
        const pending = this.pendingJobRequests.get(msg.request_id);
        if (pending) {
          this.pendingJobRequests.delete(msg.request_id);
          clearTimeout(pending.timer);
          pending.resolve(Array.isArray(msg.jobs) ? msg.jobs : []);
        }
        break;
      }
      default:
        // Forward all engine events onto the bus. The WebSocket broadcaster
        // listens for these and relays them to browsers.
        this.bus.emit(msg.type, msg);
        break;
    }
  }

  maybeRestart() {
    if (this.restartAttempts >= config.engineMaxRestarts) {
      this.fatalError = true;
      // Emit a terminal error for each pending command before discarding
      const pending = this.pendingCommands;
      this.pendingCommands = [];
      for (const cmd of pending) {
        const id = cmd.id || "";
        this.bus.emit("error", {
          type: "error",
          id,
          error_type: "EngineFatalError",
          error: "Engine crashed and could not be restarted.",
        });
      }
      // Any in-flight jobs queries can never be answered — release them.
      this._failPendingJobRequests();
      this.bus.emit("fatal_error", {
        error: "Engine crashed and could not be restarted.",
      });
      return;
    }
    this.restartAttempts += 1;
    console.warn(`Engine exited unexpectedly — restarting (${this.restartAttempts}/${config.engineMaxRestarts})`);
    setTimeout(() => this.spawn(), 500);
  }

  sendCommand(command) {
    if (this.fatalError) {
      throw new Error("Engine is in fatal error state");
    }
    // Bound the pending queue — reject new commands if the engine is down and
    // the backlog is already large, so a burst cannot grow memory unboundedly.
    if (!this.stdin || this.stdin.destroyed) {
      if (this.pendingCommands.length >= this.maxPendingCommands) {
        throw new Error("Engine backlog full, try again shortly");
      }
      // Queue the command — the engine may still be starting up.
      this.pendingCommands.push(command);
      return;
    }
    this._writeCommand(command);
  }

  // Backpressure-aware write: if the pipe's buffer is full (write returns
  // false), queue the command and resume on the 'drain' event instead of
  // accumulating an unbounded kernel buffer.
  _writeCommand(command) {
    if (!this.stdin || this.stdin.destroyed) {
      this.pendingCommands.push(command);
      return;
    }
    const ok = this.stdin.write(JSON.stringify(command) + "\n");
    if (!ok) {
      // Resume writing queued commands once the outgoing buffer drains.
      this.stdin.once("drain", () => this.flushPending());
    }
  }

  flushPending() {
    if (!this.stdin || this.stdin.destroyed) return;
    const pending = this.pendingCommands;
    this.pendingCommands = [];
    for (const cmd of pending) {
      this._writeCommand(cmd);
    }
  }

  // ── Active-jobs snapshot ────────────────────────────────────────────────────
  // Queries the Python engine for its active download jobs. Used by the status
  // route to let a reconnecting browser reconcile queue items that may have
  // missed terminal events while its WebSocket was down. Resolves to [] when
  // the engine is unavailable (never rejects — callers must not have to guard).
  requestJobs(timeoutMs = 500) {
    return new Promise((resolve) => {
      if (
        this.fatalError ||
        !this.child ||
        !this.stdin ||
        this.stdin.destroyed
      ) {
        resolve([]);
        return;
      }
      const requestId = `jobs-${++this._jobRequestSeq}`;
      const timer = setTimeout(() => {
        this.pendingJobRequests.delete(requestId);
        resolve([]);
      }, timeoutMs);
      this.pendingJobRequests.set(requestId, { resolve, timer });
      this._writeCommand({ cmd: "jobs", request_id: requestId });
    });
  }

  // Resolve all in-flight jobs queries with [] (engine down / restarting).
  _failPendingJobRequests() {
    for (const [requestId, pending] of this.pendingJobRequests) {
      clearTimeout(pending.timer);
      pending.resolve([]);
      this.pendingJobRequests.delete(requestId);
    }
  }

  isReady() {
    return !!this.child && this.ready;
  }

  // Expose cached tool availability (ffmpeg/ffprobe/deno) from the last
  // engine_ready message, or null if the engine hasn't reported readiness.
  getTools() {
    return this.readyTools;
  }

  // Number of commands queued while the engine is down or starting up.
  // Exposed via /api/status so the UI can show engine backlog pressure.
  getPendingCount() {
    return this.pendingCommands.length;
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
      this.stdin = null;
    }
    this.pendingCommands = [];
    this._failPendingJobRequests();
  }
}
