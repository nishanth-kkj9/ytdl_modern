import { Router } from "express";
import { config } from "../config.mjs";

/**
 * status.mjs — GET /api/status
 * Reports server + engine status for the UI header / health checks.
 */
export function statusRouter(engineManager) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const tools = engineManager.getTools ? engineManager.getTools() : null;
    // Best-effort snapshot of active download jobs (id + status). Lets a
    // reconnecting browser resolve queue items whose terminal events were
    // missed while its WebSocket was down. Must never fail the endpoint when
    // the engine is down — requestJobs() resolves [] in that case; the catch
    // is defense-in-depth.
    let activeJobs = [];
    if (typeof engineManager.requestJobs === "function") {
      try {
        activeJobs = await engineManager.requestJobs(500);
      } catch {
        activeJobs = [];
      }
    }
    res.json({
      server: "ytdl-modern-web",
      engineReady: engineManager.isReady(),
      downloadDir: config.downloadsDir,
      // Tool availability surfaced from the last engine_ready message
      // (null/absent until the engine first reports readiness).
      tools,
      activeJobs,
    });
  });

  return router;
}
