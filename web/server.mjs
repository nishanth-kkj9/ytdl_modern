import express from "express";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "./config.mjs";
import { EventBus } from "./eventBus.mjs";
import { EngineManager } from "./services/engineManager.mjs";
import { historyService } from "./services/historyService.mjs";
import { probeRouter } from "./routes/probe.mjs";
import { downloadRouter } from "./routes/download.mjs";
import { historyRouter } from "./routes/history.mjs";
import { statusRouter } from "./routes/status.mjs";
import { restartRouter } from "./routes/restart.mjs";
import { staticMiddleware } from "./middleware/static.mjs";
import { rateLimit, originCheck } from "./middleware/security.mjs";

async function main() {
  // ── Core services ───────────────────────────────────────────────────────
  await historyService.init();
  const bus = new EventBus();
  const engine = new EngineManager(bus);

  // ── Express app ─────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");

  // Reject requests with unexpected Host headers (DNS rebinding protection).
  // A local server must only be reachable via 127.0.0.1/localhost — an
  // attacker-controlled domain resolving to 127.0.0.1 must not pass.
  // NOTE: This allowlist is intentionally localhost-only. If `HOST` is
  // overridden to expose the server on a LAN, LAN clients' Host headers will
  // be rejected with 421 — the server is designed to be local-hosted.
  const allowedHosts = new Set([
    `127.0.0.1:${config.port}`,
    `localhost:${config.port}`,
    "127.0.0.1",
    "localhost",
  ]);
  app.use((req, res, next) => {
    const host = String(req.headers.host || "").toLowerCase();
    if (!allowedHosts.has(host)) {
      return res.status(421).json({ error: "Invalid Host header" });
    }
    next();
  });

  // API routes (modular — add feature routes here).
  // Mutating endpoints are rate-limited and origin-checked to prevent a local
  // process or compromised browser tab from flooding the engine, and to block
  // cross-site requests (defense-in-depth on top of the JSON-only body parsing).
  app.use("/api/probe", originCheck(), rateLimit({ maxRequests: 10, windowMs: 10_000 }), probeRouter(engine));
  app.use("/api/download", originCheck(), rateLimit({ maxRequests: 5, windowMs: 10_000 }), downloadRouter(engine));
  app.use("/api/history", originCheck(), historyRouter(historyService));
  app.use("/api/status", statusRouter(engine));
  app.use("/api/engine/restart", originCheck(), rateLimit({ maxRequests: 5, windowMs: 10_000 }), restartRouter(engine));

  // Health check.
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Static frontend + downloads.
  app.use(staticMiddleware(config));

  // ── HTTP + WebSocket server ─────────────────────────────────────────────
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Relay all engine events to connected browsers.
  const eventTypes = [
    "engine_ready",
    "engine_log",
    "engine_crashed",
    "engine_error",
    "fatal_error",
    "probe_result",
    "download_started",
    "progress",
    "result",
    "cancelled",
    "error",
  ];
  const unsubs = eventTypes.map((type) =>
    bus.subscribe(type, (payload) => broadcast({ type, payload }))
  );

  wss.on("connection", (socket) => {
    // Send current engine status on connect.
    socket.send(
      JSON.stringify({
        type: "engine_ready",
        payload: { ready: engine.isReady() },
      })
    );
    // Track liveness so stale/half-open connections are cleaned up.
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    // Note: The WebSocket is strictly for server → client event broadcasting.
    // Incoming commands are NOT accepted here — all mutating operations
    // (probe, download, cancel) go through the validated REST API routes.
    // This prevents Cross-Site WebSocket Hijacking (CSWSH) attacks where a
    // malicious website could otherwise drive arbitrary downloads or
    // arbitrary file writes via the Python engine.
  });

  // ── WebSocket heartbeat ─────────────────────────────────────────────────────
  // Terminate clients that miss two consecutive heartbeats so half-open
  // connections don't accumulate. The timer is unref'd so it never blocks
  // process exit.
  const HEARTBEAT_INTERVAL_MS = 30_000;
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        client.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  // ── Start engine ────────────────────────────────────────────────────────
  engine.start();

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = () => {
    console.log("\nShutting down...");
    clearInterval(heartbeat);
    unsubs.forEach((u) => u());
    engine.stop();
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ── Error handling middleware ───────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // ── Listen ──────────────────────────────────────────────────────────────
  server.listen(config.port, config.host, () => {
    console.log(`\n🎬 YTDL Modern Web`);
    console.log(`   ➜  http://${config.host}:${config.port}`);
    console.log(`   ➜  API health: http://${config.host}:${config.port}/api/health`);
    console.log(`   ➜  WebSocket: ws://${config.host}:${config.port}/ws\n`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
