// UI-only copy of the server-side allowlist in web/validate.mjs
// (YOUTUBE_REGEX), which is the authoritative enforcement point (the server
// rejects non-YouTube URLs with a 400 regardless of what this copy allows).
// src/urlRegex.test.ts pins both patterns to the same fixture set — update
// both together when adding support for new URL shapes.
export const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w-]{11}(?![\w-])(?:[?&#/].*)?$/i;
