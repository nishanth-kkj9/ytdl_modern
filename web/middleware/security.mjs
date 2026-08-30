/**
 * security.mjs — rate limiting + origin-check middleware.
 *
 * Rate limiting: a simple in-memory per-IP token bucket. This is a local
 * single-user server, so a lightweight hand-rolled limiter is sufficient —
 * no external dependency needed. It prevents a local process or compromised
 * browser tab from flooding the engine with probe/download commands.
 *
 * Origin check: rejects cross-site requests to mutating endpoints. The
 * frontend sends `Content-Type: application/json`, which triggers a CORS
 * preflight for cross-origin requests; since the server sets no CORS headers,
 * the preflight fails. This middleware adds an explicit defense-in-depth
 * check so that even if CORS headers are ever added, cross-site requests
 * still fail.
 */
import { config } from "../config.mjs";

// ── Rate limiter ─────────────────────────────────────────────────────────────

/**
 * Create a per-IP token-bucket rate limiter.
 * @param {number} maxRequests Max requests allowed per window.
 * @param {number} windowMs Window length in milliseconds.
 * @returns {import("express").RequestHandler}
 */
export function rateLimit({ maxRequests, windowMs }) {
  const buckets = new Map();

  // Periodically prune stale buckets to avoid unbounded memory growth.
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.resetAt > windowMs) {
        buckets.delete(key);
      }
    }
  }, windowMs).unref?.();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

// ── Origin check ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${config.port}`,
  `http://localhost:${config.port}`,
]);

// The Vite dev server serves the frontend on its own origin
// (http://localhost:5173 by default, and it drifts to 5174+ if 5173 is
// taken), which must be able to call the API. Any loopback origin is
// accepted: a remote site cannot spoof a localhost Origin header, and the
// Host-header allowlist in server.mjs still restricts the server itself to
// local binding — so this loosens nothing against cross-site requests.
const LOOPBACK_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

/**
 * Reject requests whose Origin header (when present) is not the local server.
 * Requests without an Origin header (e.g. curl, same-origin fetch) pass.
 * @returns {import("express").RequestHandler}
 */
export function originCheck() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin) && !LOOPBACK_ORIGIN_RE.test(origin)) {
      return res.status(403).json({ error: "Cross-origin request rejected" });
    }
    next();
  };
}