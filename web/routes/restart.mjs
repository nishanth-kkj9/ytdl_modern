import { Router } from "express";

/**
 * restart.mjs — POST /api/engine/restart
 * Recovers the Python engine from a fatal-error state (exhausted restart
 * budget or spawn failure) without restarting the whole server.
 */
export function restartRouter(engineManager) {
  const router = Router();

  router.post("/", (_req, res) => {
    // recover() resets the fatal flag and respawns the engine.
    engineManager.recover();
    return res.json({ ok: true });
  });

  return router;
}