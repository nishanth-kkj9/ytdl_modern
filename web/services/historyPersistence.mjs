import { sanitizeHistoryRecord } from "../validate.mjs";

/**
 * historyPersistence.mjs — server-side download history writer (F-01).
 *
 * The browser used to be the ONLY writer of download history (a save_history
 * POST from useEngineEvents on the WS `result` event). A closed/refreshed tab
 * mid-download meant the engine finished the file but no history record was
 * ever written. Persisting on the bus here makes history a property of the
 * SERVER, not of whoever happened to be watching.
 *
 * Dedupe: historyService.saveRecord merges by id, and the client's
 * addHistoryItem skips ids it already has — a server-saved record and a
 * later client-shaped record for the same download converge to one entry.
 */
export function attachHistoryPersistence(bus, historyService) {
  return bus.subscribe("result", (payload) => {
    // Only successful results are history; failures live in the queue/log.
    if (!payload || payload.success !== true) return;
    try {
      const fmt = String(payload.fmt ?? "");
      const check = sanitizeHistoryRecord({
        id: String(payload.id ?? ""),
        title: String(payload.title ?? "Unknown title"),
        fmt,
        size: String(payload.file_size ?? "0"),
        duration: String(payload.duration ?? "0"),
        url: String(payload.url ?? ""),
        downloaded_at: new Date().toISOString(),
        filepath: String(payload.filepath ?? ""),
        // fmt-based type detection mirrors the frontend's resolvedType logic.
        type: ["mp4", "webm", "mkv"].includes(fmt.toLowerCase()) ? "video" : "audio",
        status: "completed",
      });
      if (check.ok) {
        historyService.saveRecord(check.record).catch((err) => {
          console.error("[history] Server-side persist failed:", err?.message);
        });
      }
    } catch (err) {
      console.error("[history] Server-side persist failed:", err?.message);
    }
  });
}
