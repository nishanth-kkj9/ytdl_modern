import { Router } from "express";

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
    const record = req.body;
    if (!record || !record.id) {
      return res.status(400).json({ error: "record with id is required" });
    }
    try {
      await historyService.saveRecord(record);
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
