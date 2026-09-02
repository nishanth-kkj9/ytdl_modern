/**
 * requestLog.mjs — minimal API request logging for observability.
 *
 * Logs one compact line per request (`METHOD /path STATUS duration`) for
 * `/api/*` requests only — static assets and SPA fallbacks are deliberately
 * quiet so the log stays useful. Duration is measured from middleware entry
 * to response finish, so it includes handler time.
 *
 * The log sink is injectable (defaults to console.log) for testing.
 *
 * @param {{ log?: (...args: unknown[]) => void }} [options]
 * @returns {import("express").RequestHandler}
 */
export function requestLogger({ log = console.log } = {}) {
  return (req, res, next) => {
    if (!req.path.startsWith("/api")) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      log(`${req.method} ${req.originalUrl || req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  };
}