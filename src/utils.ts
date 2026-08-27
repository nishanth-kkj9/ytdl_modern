// Only render thumbnails from YouTube's known CDN domains (defense-in-depth;
// the server already enforces this via _is_safe_thumbnail_url).
const SAFE_THUMBNAIL_HOSTS = [".ytimg.com", ".googleusercontent.com", ".googlevideo.com", ".youtube.com"];
export function isSafeThumbnail(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return SAFE_THUMBNAIL_HOSTS.some((h) => host.endsWith(h));
  } catch {
    return false;
  }
}

export function fmtSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
