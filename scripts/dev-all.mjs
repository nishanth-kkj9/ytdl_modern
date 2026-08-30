// scripts/dev-all.mjs — run the Vite dev server and the Node backend together.
//
// `npm run dev` only starts the frontend; API/WS calls are proxied to
// 127.0.0.1:3000 (see vite.config.ts) and fail with ECONNREFUSED when the
// backend isn't running. This script starts both, tags their output, and
// shuts the other one down if either exits (e.g. Ctrl+C or a crash).
import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const children = [];

// Pre-flight: detect an already-occupied port before spawning, so the user
// gets a clear one-line explanation instead of an EADDRINUSE stack trace
// (and so a stale backend from a previous session is diagnosed immediately).
function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(true));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(port, host);
  });
}


function spawnChild(name, args) {
  // Spawn via node directly (no shell) so child.kill() reliably terminates
  // the actual process on Windows as well as POSIX.
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${name}] `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(`${tag}${line}\n`);
    });
    stream.on("end", () => {
      if (buf) out.write(`${tag}${buf}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  children.push(child);
  return child;
}

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ── Pre-flight port checks ──────────────────────────────────────────────────
if (await isPortInUse(3000)) {
  console.error("[dev-all] ✗ Backend port 127.0.0.1:3000 is already in use.");
  console.error("[dev-all]   A previous backend (or another app) is still listening there.");
  console.error('[dev-all]   Stop it first — PowerShell: Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess }');
  process.exit(1);
}
if (await isPortInUse(5173)) {
  console.warn("[dev-all] ! Port 5173 is busy — Vite will pick the next free port (watch its output).");
}

const frontend = spawnChild("vite", ["node_modules/vite/bin/vite.js"]);
const backend = spawnChild("server", ["web/server.mjs"]);

console.log("[dev-all] Frontend: http://localhost:5173  ·  Backend: http://127.0.0.1:3000");
console.log("[dev-all] Press Ctrl+C to stop both.\n");

for (const [child, label] of [
  [frontend, "Frontend"],
  [backend, "Backend"],
]) {
  child.on("exit", (code) => {
    if (exiting) return;
    console.error(`\n[dev-all] ${label} exited (code ${code}) — shutting down the other…`);
    shutdown(code ?? 1);
  });
}
