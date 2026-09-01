import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
// Read the web package version at startup (throws only if package.json is missing).
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * Central configuration for the YTDL Web server.
 * Easy to extend — add new keys here and consume them in modules.
 */
export const config = {
  // Server
  port: Number(process.env.PORT || 3000),
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
  engineMaxPendingCommands: Number(process.env.ENGINE_MAX_PENDING || 100),
};
