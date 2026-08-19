import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/**
 * Central configuration for the YTDL Web server.
 * Easy to extend — add new keys here and consume them in modules.
 */
export const config = {
  // Server
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1",

  // Paths
  projectRoot,
  publicDir: path.join(__dirname, "public"),
  distDir: path.join(projectRoot, "dist"),
  engineEntry: path.join(projectRoot, "python-engine", "ipc_main.py"),
  downloadsDir: path.join(projectRoot, "downloads"),
  dataDir: path.join(__dirname, "data"),
  historyFile: path.join(__dirname, "data", "history.json"),

  // Engine
  engineCwd: path.join(projectRoot, "python-engine"),
  engineMaxRestarts: 3,

  // Static assets to serve when frontend build is missing
  fallbackServeDist: true,
};
