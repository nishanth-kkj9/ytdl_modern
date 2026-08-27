import { Router } from "express";
import { config } from "../config.mjs";

/**
 * status.mjs — GET /api/status
 * Reports server + engine status for the UI header / health checks.
 */
export function statusRouter(engineManager) {
  const router = Router();

  router.get("/", (_req, res) => {
    const tools = engineManager.getTools ? engineManager.getTools() : null;
    res.json({
      server: "ytdl-modern-web",
      engineReady: engineManager.isReady(),
      downloadDir: config.downloadsDir,
      // Tool availability surfaced from the last engine_ready message
      // (null/absent until the engine first reports readiness).
      tools,
    });
  });

  return router;
}
