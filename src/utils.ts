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
  // Round the total first: deriving m and s independently of a rounded
  // remainder produced "1:60" for inputs like 119.9 (floor(119.9/60)=1,
  // round(59.9)=60). Rounding up front keeps the parts consistent.
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
