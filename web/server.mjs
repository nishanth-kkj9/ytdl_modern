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
import { staticMiddleware } from "./middleware/static.mjs";

async function main() {
  // ── Core services ───────────────────────────────────────────────────────
  await historyService.init();
  const bus = new EventBus();
  const engine = new EngineManager(bus);

  // ── Express app ─────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");

  // API routes (modular — add feature routes here).
  app.use("/api/probe", probeRouter(engine));
  app.use("/api/download", downloadRouter(engine));
  app.use("/api/history", historyRouter(historyService));
  app.use("/api/status", statusRouter(engine));

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
    socket.on("message", (raw) => {
      // Allow clients to send commands over WS too (future-proof).
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.cmd) {
          engine.sendCommand(msg);
        }
      } catch {
        /* ignore malformed messages */
      }
    });
  });

  // ── Start engine ────────────────────────────────────────────────────────
  engine.start();

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = () => {
    console.log("\nShutting down...");
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
