import assert from "node:assert";

async function run() {
  const base = "http://127.0.0.1:3000";
  console.log("Running automated smoke tests...");

  // 1. Health check
  const health = await fetch(`${base}/api/health`).then(r => r.json());
  assert.strictEqual(health.ok, true, "Health check failed");
  console.log("✓ /api/health OK");

  // 2. Status check
  const status = await fetch(`${base}/api/status`).then(r => r.json());
  assert.strictEqual(typeof status.engineReady, "boolean", "Status check failed");
  console.log("✓ /api/status OK");

  // 3. History load
  const history = await fetch(`${base}/api/history`).then(r => r.json());
  assert.strictEqual(Array.isArray(history), true, "History load failed");
  console.log("✓ GET /api/history OK");

  // 4. Probe invalid URL (should fail with 400)
  const probeBad = await fetch(`${base}/api/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "not-a-url" })
  });
  assert.strictEqual(probeBad.status, 400, "Bad probe should return 400");
  console.log("✓ POST /api/probe validation OK");

  // 5. History clear (DELETE)
  const clearRes = await fetch(`${base}/api/history`, { method: "DELETE" }).then(r => r.json());
  assert.strictEqual(clearRes.ok, true, "History clear failed");
  console.log("✓ DELETE /api/history OK");

  console.log("\nAll automated smoke tests passed successfully!");
}

run().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
