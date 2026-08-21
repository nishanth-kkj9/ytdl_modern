import { Router } from "express";
import { config } from "../config.mjs";

/**
 * status.mjs — GET /api/status
 * Reports server + engine status for the UI header / health checks.
 */
export function statusRouter(engineManager) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      server: "ytdl-modern-web",
      engineReady: engineManager.isReady(),
      downloadDir: config.downloadsDir,
    });
  });

  return router;
}
