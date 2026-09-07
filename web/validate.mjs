/**
 * validate.mjs — shared URL validation + history record sanitization helpers.
 */
// NOTE: the client-side copy of this pattern lives in src/components/urlRegex.ts.
// This server-side copy is the authoritative enforcement point; the frontend
// copy only gates the Probe/Add buttons. src/urlRegex.test.ts pins both
// patterns to the same fixture set — update both together.
export const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])(?:[?&#\/].*)?$/i;

export const MAX_URL_LENGTH = 2048;

// F-10: seconds or HH:MM:SS / MM:SS — mirrors python engine.parse_timestamp
// (engine.py) so both layers accept/reject the same shapes. Returns seconds,
// or null when the value is not a valid non-negative timestamp.
export function parseTimestamp(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const parts = text.trim().split(":");
  if (parts.length > 3) return null;
  try {
    let total;
    if (parts.length === 1) {
      total = parseFloat(parts[0]);
    } else if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseFloat(parts[1]);
      if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
      total = m * 60 + s;
    } else {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseFloat(parts[2]);
      if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
      total = h * 3600 + m * 60 + s;
    }
    return Number.isFinite(total) && total >= 0 && total < 86400 * 7 ? total : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url) {
  if (typeof url !== "string" || url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  return YOUTUBE_REGEX.test(url);
}

// ── History record sanitization (I-09) ────────────────────────────────────────
// Whitelist of fields persisted for a history record. Everything else sent by
// clients is discarded so arbitrary payloads can't be stored.
const HISTORY_FIELDS = new Set([
  "id",
  "title",
  "fmt",
  "size",
  "duration",
  "url",
  "downloaded_at",
  "filepath",
  "type",
  "status",
  "thumbnail",
]);

const STRING_CAPS = { title: 500, filepath: 500, thumbnail: 500 };
const STRING_ELLIPSIS = 256;

function capString(value, field) {
  const limit = STRING_CAPS[field] ?? STRING_ELLIPSIS;
  return value.slice(0, limit);
}

/**
 * Validate + sanitize a history record from an API request body.
 * @param {unknown} body
 * @returns {{ ok: true, record: Record<string, unknown> } | { ok: false, error: string }}
 */
export function sanitizeHistoryRecord(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "record must be an object" };
  }
  const id = body.id;
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, error: "record with non-empty string id is required" };
  }

  const record = { id: id.slice(0, 128) };
  for (const field of HISTORY_FIELDS) {
    if (field === "id") continue;
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (field === "type") {
      // content mode must be one of the two supported values
      if (value === "audio" || value === "video") {
        record.type = value;
      }
      continue;
    }
    if (field === "status") {
      // download status values mirror the frontend DownloadStatus union
      if (["queued", "downloading", "completed", "failed", "cancelled"].includes(value)) {
        record.status = value;
      }
      continue;
    }
    if (typeof value === "string") {
      record[field] = capString(value, field);
    } else if (typeof value === "boolean") {
      record[field] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      record[field] = value;
    }
    // any other type is silently dropped
  }
  return { ok: true, record };
}
