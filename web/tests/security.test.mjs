import assert from "node:assert";
import { allowedOriginsFor, allowedHostsFor } from "../config.mjs";
import { originCheck } from "../middleware/security.mjs";

// ── originCheck middleware ─────────────────────────────────────────────────────

function run(origin) {
  let status = 200;
  let body = null;
  let nextCalled = false;
  const mw = originCheck();
  const req = { headers: origin === undefined ? {} : { origin } };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  mw(req, res, () => {
    nextCalled = true;
  });
  return { status, body, nextCalled };
}

// Test 1: no Origin header (curl, same-origin fetch) passes
{
  const r = run(undefined);
  assert.strictEqual(r.nextCalled, true);
  console.log("✓ origin: no Origin header passes");
}

// Test 2: the server's own origin passes
{
  assert.strictEqual(run("http://127.0.0.1:3000").nextCalled, true);
  assert.strictEqual(run("http://localhost:3000").nextCalled, true);
  console.log("✓ origin: server origin passes");
}

// Test 3 (regression): Vite dev-server origins must pass — the dev frontend
// calls the API from http://localhost:5173 (or 5174+ if 5173 was busy).
// IPv6 loopback is included to stay symmetric with the Host allowlist.
{
  assert.strictEqual(run("http://localhost:5173").nextCalled, true);
  assert.strictEqual(run("http://127.0.0.1:5173").nextCalled, true);
  assert.strictEqual(run("http://localhost:5174").nextCalled, true);
  assert.strictEqual(run("http://[::1]:3000").nextCalled, true);
  console.log("✓ origin: loopback dev-server origins pass (incl. IPv6)");
}

// Test 4: foreign origins are still rejected with 403
{
  for (const origin of ["https://evil.com", "http://evil.com:5173", "https://localhost.evil.com"]) {
    const r = run(origin);
    assert.strictEqual(r.nextCalled, false, `${origin} must not pass`);
    assert.strictEqual(r.status, 403);
    assert.deepStrictEqual(r.body, { error: "Cross-origin request rejected" });
  }
  console.log("✓ origin: foreign origins rejected with 403");
}

// Test 5: the shared allowlist helpers (single source of truth for the Host
// and Origin rebinding guards) produce consistent, port-sensitive sets.
{
  const hosts = allowedHostsFor(3100);
  assert.ok(hosts.has("127.0.0.1:3100"));
  assert.ok(hosts.has("localhost:3100"));
  assert.ok(hosts.has("[::1]:3100"));
  assert.ok(hosts.has("127.0.0.1"));
  assert.ok(!hosts.has("127.0.0.1:3000"), "port must be parameterized");
  const origins = allowedOriginsFor(3100);
  assert.ok(origins.has("http://127.0.0.1:3100"));
  assert.ok(origins.has("http://localhost:3100"));
  assert.ok(!origins.has("http://localhost:5173"), "non-server origins must not be allowed");
  console.log("✓ allowlist helpers: port-parameterized + consistent");
}

console.log("All security (origin check) tests passed.");
