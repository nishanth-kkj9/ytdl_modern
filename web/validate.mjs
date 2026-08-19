/**
 * validate.mjs — shared URL validation helpers.
 */
export const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}/i;

export function isYouTubeUrl(url) {
  return YOUTUBE_REGEX.test(url);
}
