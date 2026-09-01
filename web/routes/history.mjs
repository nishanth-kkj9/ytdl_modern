import { Router } from "express";
import { sanitizeHistoryRecord } from "../validate.mjs";

/**
 * history.mjs — GET/POST /api/history
 * Abstraction over historyService for local persistence.
 */

// Parse a non-negative-integer query param with a default and an upper clamp.
// Invalid/missing/negative values fall back to the default so a malformed
// client can never trigger slice() with a NaN/negative index.
function clampInt(query, name, fallback, max) {
  const raw = Array.isArray(query[name]) ? query[name][0] : query[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export function historyRouter(historyService) {
  const router = Router();

  // GET /api/history?limit=&offset=
  // Backward compatible: no query params returns the default 100-record page.
  // limit is clamped to [0, 200] so a paging client cannot request huge pages.
  router.get("/", async (req, res, next) => {
    try {
      const limit = clampInt(req.query, "limit", 100, 200);
      const offset = clampInt(req.query, "offset", 0, 100000);
      const records = await historyService.loadHistory(limit, offset);
      return res.json(records);
    } catch (err) {
      // Delegate to the central error handler so internal details are never
      // leaked to the client.
      return next(err);
    }
  });

  router.post("/", async (req, res, next) => {
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
      return next(err);
    }
  });

  router.delete("/", async (_req, res, next) => {
    try {
      await historyService.clear();
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
