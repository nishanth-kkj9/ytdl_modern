import assert from "node:assert";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { staticMiddleware } from "../middleware/static.mjs";

// Regression coverage for the Express 5 (path-to-regexp v8) migration:
// the old `router.get("*", ...)` wildcard throws at registration time
// ("Missing parameter name at index 1: *") under Express 5, which crashed
// the whole server on startup before server.listen() was reached.

async function startServer(router) {
  const app = express();
  app.use(router);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function get(server, p) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${p}`);
  return { status: res.status, body: await res.text() };
}

// ── dist present: SPA mode ───────────────────────────────────────────────────

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytdl-dist-"));
fs.writeFileSync(path.join(distDir, "index.html"), "<html><body>SPA-SHARED-SENTINEL</body></html>");
fs.mkdirSync(path.join(distDir, "assets"));
fs.writeFileSync(path.join(distDir, "assets", "app.js"), "console.log(1);");

// Test 1 (regression): middleware must register cleanly when dist/ exists.
let router;
assert.doesNotThrow(
  () => {
    router = staticMiddleware({ downloadsDir: os.tmpdir(), distDir });
  },
  "staticMiddleware() must not throw when dist/index.html exists (Express 5 wildcard syntax)"
);
console.log("✓ static: staticMiddleware() registers cleanly with dist present");

// Test 2: "/" serves the built index.html.
const server = await startServer(router);
{
  const r = await get(server, "/");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /SPA-SHARED-SENTINEL/);
  console.log("✓ static: \"/\" serves the built index.html");
}

// Test 3: deep SPA routes fall back to index.html.
{
  const r = await get(server, "/some/deep/spa/route");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /SPA-SHARED-SENTINEL/);
  console.log("✓ static: deep SPA route falls back to index.html");
}

// Test 4: static assets under dist/ are still served directly.
{
  const r = await get(server, "/assets/app.js");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /console\.log/);
  console.log("✓ static: dist assets are served directly");
}
server.close();

// ── dist absent: placeholder mode ────────────────────────────────────────────

// Test 5: without dist/, "/" serves the friendly placeholder (no crash).
{
  const placeholderRouter = staticMiddleware({
    downloadsDir: os.tmpdir(),
    distDir: path.join(os.tmpdir(), "ytdl-does-not-exist"),
  });
  const placeholderServer = await startServer(placeholderRouter);
  const r = await get(placeholderServer, "/");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /Frontend build not found/);
  placeholderServer.close();
  console.log("✓ static: no-dist placeholder mode still works");
}

console.log("All static middleware tests passed.");