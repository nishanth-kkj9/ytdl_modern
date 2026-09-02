import assert from "node:assert";
import http from "node:http";
import express from "express";
import { requestLogger } from "../middleware/requestLog.mjs";

function makeApp(logger) {
  const app = express();
  app.use(logger);
  app.get("/api/ok", (_req, res) => res.json({ ok: true }));
  app.get("/api/fail", (_req, res) => res.status(500).json({ error: "boom" }));
  app.get("/static/file.js", (_req, res) => res.json({}));
  return app;
}

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
        res.resume();
        res.on("end", () => {
          server.close();
          resolve(res.statusCode);
        });
      });
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

{
  const lines = [];
  const fake = { log: (...args) => lines.push(args.join(" ")) };
  const app = makeApp(requestLogger({ log: fake.log }));
  await request(app, "/api/ok");
  await request(app, "/api/fail");
  await request(app, "/static/file.js");

  assert.strictEqual(lines.length, 2, "only /api requests are logged (static is quiet)");
  assert.match(lines[0], /GET \/api\/ok 200 \d+ms$/);
  assert.match(lines[1], /GET \/api\/fail 500 \d+ms$/);
  console.log("✓ requestLogger logs method, path, status, duration for /api only");
}

console.log("All requestLog tests passed.");