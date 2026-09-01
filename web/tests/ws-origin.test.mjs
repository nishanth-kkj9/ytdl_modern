import assert from "node:assert";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { LOOPBACK_ORIGIN_RE, wsVerifyClient } from "../middleware/security.mjs";

// Regression coverage for the /ws WebSocket origin check: the upgrade used
// to accept ANY Origin header, letting any page open in the user's browser
// connect to ws://127.0.0.1:3000/ws and passively eavesdrop on every
// broadcast (local file paths, titles, engine logs). The policy now mirrors
// the REST originCheck() middleware.

// ── LOOPBACK_ORIGIN_RE ───────────────────────────────────────────────────────

// Test 1: loopback origins match, foreign origins don't.
{
  for (const origin of [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://[::1]:3000",
  ]) {
    assert.ok(LOOPBACK_ORIGIN_RE.test(origin), `${origin} must match`);
  }
  for (const origin of ["https://evil.com", "http://evil.com:5173", "https://localhost.evil.com", "http://localhost.evil.com:3000"]) {
    assert.ok(!LOOPBACK_ORIGIN_RE.test(origin), `${origin} must not match`);
  }
  console.log("✓ ws-origin: LOOPBACK_ORIGIN_RE matches loopback only (incl. [::1])");
}

// ── wsVerifyClient against a real ws upgrade ─────────────────────────────────

const server = http.createServer((_req, res) => res.end("not a ws endpoint"));
const wss = new WebSocketServer({ server, path: "/ws", verifyClient: wsVerifyClient });
wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "engine_ready", payload: {} }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

function tryConnect(origin) {
  return new Promise((resolve, reject) => {
    const options = origin === undefined ? undefined : { headers: { origin } };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, options);
    ws.on("open", () => {
      // Only resolve after the first broadcast arrives, proving the
      // connection actually delivers data.
      ws.once("message", (data) => {
        ws.close();
        resolve({ accepted: true, payload: data.toString() });
      });
    });
    ws.on("error", (err) => {
      resolve({ accepted: false, error: err });
    });
  });
}

// Test 2 (regression): a foreign origin must be rejected with 403.
{
  const r = await tryConnect("https://evil.com");
  assert.strictEqual(r.accepted, false, "evil.com origin must be rejected");
  assert.match(String(r.error.message), /403/, `rejection must be a 403 upgrade response, got: ${r.error.message}`);
  console.log("✓ ws-origin: foreign origin rejected with 403");
}

// Test 3: server's own origin connects and receives broadcasts.
{
  const r = await tryConnect(`http://127.0.0.1:${port}`);
  assert.strictEqual(r.accepted, true, "server origin must be accepted");
  assert.match(r.payload, /engine_ready/);
  console.log("✓ ws-origin: server origin accepted and receives broadcast");
}

// Test 4: Vite dev-server origins (localhost:5173+) connect.
{
  const r = await tryConnect("http://localhost:5173");
  assert.strictEqual(r.accepted, true, "Vite dev origin must be accepted");
  console.log("✓ ws-origin: Vite dev origin accepted");
}

// Test 5: IPv6 loopback origin connects.
{
  const r = await tryConnect("http://[::1]:3000");
  assert.strictEqual(r.accepted, true, "IPv6 loopback origin must be accepted");
  console.log("✓ ws-origin: IPv6 loopback origin accepted");
}

// Test 6: clients that send no Origin header (native tools) connect.
{
  const r = await tryConnect(undefined);
  assert.strictEqual(r.accepted, true, "no-origin clients must be accepted");
  console.log("✓ ws-origin: no-Origin client accepted");
}

wss.close();
server.close();

console.log("All WebSocket origin-check tests passed.");