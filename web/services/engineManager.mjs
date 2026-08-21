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
  }

  start() {
    this.spawn();
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
      this.bus.emit("engine_error", { error: `Engine spawn failed: ${err.message}` });
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
        this.bus.emit("engine_ready", msg);
        // Flush any commands that were queued while the engine was starting.
        this.flushPending();
        break;
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
    if (!this.stdin || this.stdin.destroyed) {
      // Queue the command — the engine may still be starting up.
      this.pendingCommands.push(command);
      return;
    }
    this.stdin.write(JSON.stringify(command) + "\n");
  }

  flushPending() {
    if (!this.stdin || this.stdin.destroyed) return;
    const pending = this.pendingCommands;
    this.pendingCommands = [];
    for (const cmd of pending) {
      this.stdin.write(JSON.stringify(cmd) + "\n");
    }
  }

  isReady() {
    return !!this.child && this.ready;
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
      this.stdin = null;
    }
    this.pendingCommands = [];
  }
}
