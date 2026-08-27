import { Router } from "express";
import { sanitizeHistoryRecord } from "../validate.mjs";

/**
 * history.mjs — GET/POST /api/history
 * Abstraction over historyService for local persistence.
 */
export function historyRouter(historyService) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const records = await historyService.loadHistory(100);
      return res.json(records);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    // Whitelist + coerce the incoming record so arbitrary payloads can't be
    // persisted (I-09). Only known fields survive, with length caps applied.
    const result = sanitizeHistoryRecord(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    try {
      await historyService.saveRecord(result.record);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete("/", async (_req, res) => {
    try {
      await historyService.clear();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
