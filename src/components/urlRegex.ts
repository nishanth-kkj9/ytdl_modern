// UI-only copy of the server-side allowlist in web/validate.mjs
// (YOUTUBE_REGEX), which is the authoritative enforcement point (the server
// rejects non-YouTube URLs with a 400 regardless of what this copy allows).
// src/urlRegex.test.ts pins both patterns to the same fixture set — update
// both together when adding support for new URL shapes.
export const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w-]{11}(?![\w-])(?:[?&#/].*)?$/i;

/**
 * Extract the 11-character video id from a validated YouTube URL. Used to
 * compare probe metadata with the input URL: yt-dlp canonicalizes
 * `info.webpage_url` to `https://www.youtube.com/watch?v=…`, so a pasted
 * `youtu.be/…` short link NEVER string-equals the probe's URL — comparing
 * video ids instead keeps short-link users from silently losing probe
 * metadata (P1-11). Returns null for non-matching input.
 */
const VIDEO_ID_RE = /(?:watch\?.*v=|shorts\/|embed\/|v\/|youtu\.be\/)([\w-]{11})/i;
export function extractVideoId(url: string): string | null {
  return VIDEO_ID_RE.exec(url.trim())?.[1] ?? null;
}
