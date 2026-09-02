import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
// Read the web package version at startup (throws only if package.json is missing).
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// ── Env parsing (PR-02) ──────────────────────────────────────────────────────
// Numeric env vars must never become NaN: Number("abc") would silently poison
// config.port / config.engineMaxPendingCommands and fail later with obscure
// errors (server.listen(NaN)). Parse strictly and fall back to the documented
// default, warning loudly so a misconfigured environment is visible at startup.
function envInt(name, fallback, { min, max } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    console.warn(
      `[config] Ignoring invalid ${name}=${JSON.stringify(raw)} — using ${fallback}` +
        (min !== undefined || max !== undefined ? ` (valid range: ${min ?? "-inf"}..${max ?? "+inf"})` : "")
    );
    return fallback;
  }
  return n;
}

/**
 * Central configuration for the YTDL Web server.
 * Easy to extend — add new keys here and consume them in modules.
 */
export const config = {
  // Server
  port: envInt("PORT", 3000, { min: 1, max: 65535 }),
  host: process.env.HOST || "127.0.0.1",
  // Human-readable version exposed by /api/status (single source: web/package.json).
  version: pkg?.version || "0.0.0",

  // Paths
  projectRoot,
  distDir: path.join(projectRoot, "dist"),
  engineEntry: path.join(projectRoot, "python-engine", "ipc_main.py"),
  downloadsDir: path.join(projectRoot, "downloads"),
  // Overridable so smoke tests (which DELETE history) can run against an
  // isolated scratch directory instead of the user's real web/data/history.json.
  dataDir: process.env.YTDL_DATA_DIR || path.join(__dirname, "data"),
  historyFile: path.join(
    process.env.YTDL_DATA_DIR || path.join(__dirname, "data"),
    "history.json"
  ),

  // Engine
  engineCwd: path.join(projectRoot, "python-engine"),
  engineMaxRestarts: 3,
  // Upper bound on queued engine commands when the engine is unavailable.
  engineMaxPendingCommands: envInt("ENGINE_MAX_PENDING", 100, { min: 1 }),
};

// ── Loopback allowlists (single source of truth) ─────────────────────────────
// server.mjs (Host-header rebinding guard) and middleware/security.mjs (Origin
// check) must never drift apart, so both build their sets from these helpers.
// If `host` is overridden to expose the server beyond loopback, these sets must
// be extended deliberately — see the comment in server.mjs.
export function allowedHostsFor(port = config.port) {
  return new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    "127.0.0.1",
    "localhost",
    `[::1]:${port}`,
    "[::1]",
    "::1",
  ]);
}

export function allowedOriginsFor(port = config.port) {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}
