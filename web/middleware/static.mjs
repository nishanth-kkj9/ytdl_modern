import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * static.mjs — serves the built frontend (dist/) and the downloads folder.
 * Falls back to index.html for SPA routing.
 */
export function staticMiddleware(config) {
  const router = express.Router();

  // Serve downloaded media files by filename.
  // Hardened: no fallthrough to SPA, no dotfiles, no index (SEC-01).
  router.use(
    "/downloads",
    express.static(config.downloadsDir, { fallthrough: false, dotfiles: "deny", index: false, maxAge: "1h" })
  );

  // Serve the built React frontend if present.
  const hasDist = distExists(config.distDir);
  if (hasDist) {
    router.use(express.static(config.distDir));
    router.get("*", (_req, res) => {
      res.sendFile(path.join(config.distDir, "index.html"));
    });
  } else {
    // Friendly placeholder when `npm run build` hasn't been run yet.
    router.get("/", (_req, res) => {
      res
        .status(200)
        .type("html")
        .send(
          `<!doctype html><html><body style="font-family:sans-serif;background:#08080D;color:#E2E8F0;display:grid;place-items:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1>YTDL Modern Web</h1>
            <p>Frontend build not found. Run <code>npm run build</code> in the project root, then restart the server.</p>
            <p>Backend API is running.</p>
          </div>
        </body></html>`
        );
    });
  }

  return router;
}

function distExists(dir) {
  try {
    return existsSync(path.join(dir, "index.html"));
  } catch {
    return false;
  }
}
