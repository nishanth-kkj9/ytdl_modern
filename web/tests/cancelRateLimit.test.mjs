import assert from "node:assert";
import http from "node:http";
import express from "express";
import { cancelRouter, downloadRouter } from "../routes/download.mjs";
import { originCheck, rateLimit } from "../middleware/security.mjs";

const engine = { sendCommand() {} };
const app = express();
app.use(express.json());
// This mirrors the server registration order. The test captures corrected
// REL-02 behavior: cancels have their own higher budget, downloads retain 5.
app.use("/api/download/cancel", originCheck(), rateLimit({ maxRequests: 21, windowMs: 10_000 }), cancelRouter(engine));
app.use("/api/download", originCheck(), rateLimit({ maxRequests: 5, windowMs: 10_000 }), downloadRouter(engine));

function request(path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request({
        host: "127.0.0.1", port, path, method: "POST",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        res.resume();
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode, retryAfter: res.headers["retry-after"] });
        });
      });
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
  });
}

for (let i = 0; i < 21; i += 1) {
  const res = await request("/api/download/cancel", { id: `cancel-${i}` });
  assert.notStrictEqual(res.status, 429, `cancel ${i + 1} must not share the download limiter`);
}

for (let i = 0; i < 6; i += 1) {
  const res = await request("/api/download", {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", mode: "audio", format: "mp3", quality: "high",
  });
  assert.strictEqual(res.status, i === 5 ? 429 : 200, "downloads must retain their 5/10s budget");
  if (i === 5) assert.ok(res.retryAfter, "limited download must retain Retry-After");
}

console.log("All cancel rate-limit tests passed.");
