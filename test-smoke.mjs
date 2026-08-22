import assert from "node:assert";
import http from "node:http";

// The integration test (gated by YTDL_INTEGRATION=1) needs the `ws` package,
// which lives in web/node_modules. Import it lazily so the default smoke test
// doesn't fail if `ws` isn't resolvable from the project root.
let WebSocket = null;
if (process.env.YTDL_INTEGRATION === "1") {
  try {
    WebSocket = (await import("ws")).default;
  } catch {
    console.error("YTDL_INTEGRATION=1 requires the `ws` package (run `npm ci` in web/).");
    process.exit(1);
  }
}

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

  // 4b. DNS rebinding protection (bad Host header should fail with 421).
  // Note: fetch() strips the Host header (forbidden header), so use raw http.
  const rebindStatus = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path: "/api/health", headers: { Host: "evil.com" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.strictEqual(rebindStatus, 421, "Evil Host header should return 421");
  console.log("✓ Host header validation OK");

  // 5. History clear (DELETE)
  const clearRes = await fetch(`${base}/api/history`, { method: "DELETE" }).then(r => r.json());
  assert.strictEqual(clearRes.ok, true, "History clear failed");
  console.log("✓ DELETE /api/history OK");

  // 6. Optional integration test: probe a real URL and assert a probe_result
  //    event arrives over WebSocket. Gated by YTDL_INTEGRATION=1 because it
  //    requires network access + yt-dlp (not available in default CI).
  if (process.env.YTDL_INTEGRATION === "1") {
    console.log("Running integration test (YTDL_INTEGRATION=1)...");
    const probeUrl = process.env.YTDL_TEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const probeResult = await new Promise((resolve, reject) => {
      const ws = new WebSocket("ws://127.0.0.1:3000/ws");
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timed out waiting for probe_result"));
      }, 30000);

      ws.on("open", async () => {
        try {
          const res = await fetch(`${base}/api/probe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: probeUrl }),
          });
          if (res.status !== 200) {
            throw new Error(`Probe request failed with status ${res.status}`);
          }
        } catch (err) {
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "probe_result") {
          clearTimeout(timeout);
          ws.close();
          resolve(msg.payload);
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    assert.strictEqual(probeResult.success, true, "Probe should succeed");
    assert.ok(probeResult.info, "Probe result should include info");
    assert.ok(probeResult.info.title, "Probe result should include a title");
    console.log(`✓ Integration probe OK: "${probeResult.info.title}"`);
  } else {
    console.log("ℹ Skipping integration test (set YTDL_INTEGRATION=1 to enable)");
  }

  console.log("\nAll automated smoke tests passed successfully!");
}

run().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
