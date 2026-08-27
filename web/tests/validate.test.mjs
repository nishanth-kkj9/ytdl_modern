import assert from "node:assert";
import http from "node:http";
import express from "express";
import { sanitizeHistoryRecord } from "../validate.mjs";
import { historyRouter } from "../routes/history.mjs";
import { restartRouter } from "../routes/restart.mjs";

// ── sanitizeHistoryRecord unit tests ───────────────────────────────────────────

// Test 1: valid minimal record passes through
{
  const result = sanitizeHistoryRecord({ id: "abc-123" });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.record, { id: "abc-123" });
  console.log("✓ sanitize: minimal valid record");
}

// Test 2: unknown extra fields are stripped
{
  const result = sanitizeHistoryRecord({ id: "abc", evil: "payload", __proto__: { x: 1 } });
  assert.strictEqual(result.ok, true);
  assert.strictEqual("evil" in result.record, false, "Unknown fields must be dropped");
  assert.strictEqual("x" in result.record, false, "Prototype-polluting keys must be dropped");
  console.log("✓ sanitize: unknown / proto fields stripped");
}

// Test 3: missing / non-string id is rejected (with 400 message)
{
  assert.strictEqual(sanitizeHistoryRecord(null).ok, false);
  assert.strictEqual(sanitizeHistoryRecord([]).ok, false);
  assert.strictEqual(sanitizeHistoryRecord({ id: 42 }).ok, false);
  assert.strictEqual(sanitizeHistoryRecord({ id: "   " }).ok, false);
  console.log("✓ sanitize: bad ids rejected");
}

// Test 4: allowed fields pass through with type validation
{
  const result = sanitizeHistoryRecord({
    id: "abc",
    title: "Video Title",
    duration: "123",
    type: "audio",
    status: "completed",
    thumbnail: "https://i.ytimg.com/x.jpg",
    malformedType: "wat", // not an allowed key anyway
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.record.title, "Video Title");
  assert.strictEqual(result.record.type, "audio");
  assert.strictEqual(result.record.status, "completed");
  assert.strictEqual(result.record.thumbnail, "https://i.ytimg.com/x.jpg");
  console.log("✓ sanitize: allowed fields preserved");
}

// Test 5: invalid type/status values are dropped, strings are length-capped
{
  const result = sanitizeHistoryRecord({
    id: "abc",
    type: "bogus",
    status: 5,
    title: "x".repeat(600),
  });
  assert.strictEqual(result.record.type, undefined, "Invalid type value dropped");
  assert.strictEqual(result.record.status, undefined, "Non-string status dropped");
  assert.ok(result.record.title.length <= 500, "Long strings should be capped");
  console.log("✓ sanitize: invalid enum values dropped, length caps");
}

// ── history route (through the sanitizer) ──────────────────────────────────────

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

// Test 6: history POST strips unknown fields via the route
{
  const saved = [];
  const fakeService = {
    async saveRecord(record) {
      saved.push(record);
      return record;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(historyRouter(fakeService));
  const res = await request(app, "POST", "/", { id: "a", title: "T", evil: "x" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual("evil" in saved[0], false, "Route must not persist unknown fields");
  assert.strictEqual(saved[0].title, "T");
  console.log("✓ history route: unknown fields stripped");
}

// Test 7: history POST rejects missing id with 400
{
  const fakeService = { async saveRecord() {} };
  const app = express();
  app.use(express.json());
  app.use(historyRouter(fakeService));
  const res = await request(app, "POST", "/", { title: "no id" });
  assert.strictEqual(res.status, 400, "Missing id should be 400");
  console.log("✓ history route: missing id -> 400");
}

// ── restart route ──────────────────────────────────────────────────────────────

// Test 8: POST /api/engine/restart calls recover() and returns ok
{
  let recovered = 0;
  const engine = {
    recover() {
      recovered += 1;
      return true;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(restartRouter(engine));
  const res = await request(app, "POST", "/", {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(recovered, 1, "recover() should be invoked once");
  console.log("✓ restart route: calls recover()");
}

console.log("All validate/restart tests passed.");