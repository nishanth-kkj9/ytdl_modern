import assert from "node:assert";
import http from "node:http";
import express from "express";
import { historyRouter } from "../routes/history.mjs";

// history.mjs route tests: pagination query parsing + error delegation to the
// central error handler (never leak err.message to the client).

// Mock history service that records how it was called.
function makeService(records = []) {
  const calls = [];
  const svc = {
    calls,
    loadHistory: async (limit, offset) => {
      calls.push([limit, offset]);
      return records.slice(offset, offset + limit);
    },
    saveRecord: async () => {},
    clear: async () => {},
  };
  return svc;
}

// Replicate the central error handler exactly as web/server.mjs does, so the
// tests verify the real integration contract (500 → generic message only).
function makeApp(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((err, _req, res, _next) => {
    const status = Number(err?.statusCode || err?.status) || 500;
    res.status(status).json({
      error: status >= 500 || !err?.expose ? "Internal server error" : err.message,
    });
  });
  return app;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const opts = {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          server.close();
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// Test 1: no query params → default 100/0 page, backward compatible.
{
  const svc = makeService([{ id: "a" }]);
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "GET", "/");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(svc.calls, [[100, 0]], "Should call loadHistory(100, 0) by default");
  assert.deepStrictEqual(res.body, [{ id: "a" }]);
  console.log("✓ history GET: no params defaults to limit=100 offset=0");
}

// Test 2: limit + offset query params are honored.
{
  const svc = makeService(Array.from({ length: 10 }, (_, i) => ({ id: `r-${i}` })));
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "GET", "/?limit=5&offset=2");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(svc.calls[0], [5, 2], "Should pass limit and offset");
  assert.strictEqual(res.body.length, 5, "Should return 5 records");
  assert.strictEqual(res.body[0].id, "r-2", "Offset should skip newest records");
  console.log("✓ history GET: limit/offset pagination");
}

// Test 3: malformed query values fall back to defaults (no NaN/negative).
{
  const svc = makeService();
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "GET", "/?limit=abc&offset=-3");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(svc.calls[0], [100, 0], "Invalid params should default");
  console.log("✓ history GET: malformed query params fall back to defaults");
}

// Test 4: limit is clamped to 200.
{
  const svc = makeService();
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "GET", "/?limit=9999");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(svc.calls[0], [200, 0], "limit should be clamped to 200");
  console.log("✓ history GET: limit clamped to 200");
}

// Test 5: POST rejects an invalid record with 400 (no service call).
{
  const svc = makeService();
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "POST", "/", { notAField: 1 });
  assert.strictEqual(res.status, 400, "Invalid record should be 400");
  console.log("✓ history POST: invalid record -> 400");
}

// Test 6: a failing service delegates to the error handler — 500 with a
// generic message, never leaking the internal error string.
{
  const svc = makeService();
  svc.clear = async () => {
    throw new Error("C:\\\\secret\\\\internal\\\\path\\\\is\\\\not\\\\leaked");
  };
  const app = makeApp(historyRouter(svc));
  const res = await request(app, "DELETE", "/");
  assert.strictEqual(res.status, 500, "Service failure should be 500");
  assert.deepStrictEqual(res.body, { error: "Internal server error" });
  assert.ok(
    !JSON.stringify(res.body).includes("secret"),
    "internal error message must not leak through the response"
  );
  console.log("✓ history DELETE: failure -> generic 500, no error leak");
}

console.log("All historyRoutes tests passed.");