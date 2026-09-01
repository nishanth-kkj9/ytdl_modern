import assert from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// The module exports a singleton `historyService` (an instance of the internal
// JsonHistoryService class). To test the real implementation in isolation, we
// reconstruct a fresh instance against a temp file using the same class via
// the exported instance's prototype constructor.
import { historyService as realService } from "../services/historyService.mjs";

async function makeService() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdl-hist-"));
  const file = path.join(dir, "history.json");
  // Reconstruct a fresh instance against the temp file. The module exports a
  // singleton, so we build a new one using the same class via the prototype.
  const ServiceCtor = Object.getPrototypeOf(realService).constructor;
  const svc = new ServiceCtor(file);
  await svc.init();
  return { svc, file, dir };
}

// Test 1: init creates the directory and loads empty; file is created on save
{
  const { svc, file } = await makeService();
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 0, "Fresh history should be empty");
  // The file is only written on first saveRecord.
  await svc.saveRecord({ id: "seed", title: "Seed" });
  const raw = await fs.readFile(file, "utf8");
  assert.strictEqual(JSON.parse(raw).length, 1, "File should contain the saved record");
  console.log("✓ init + empty load + file created on save");
}

// Test 2: saveRecord persists and unshifts
{
  const { svc } = await makeService();
  await svc.saveRecord({ id: "a", title: "A" });
  await svc.saveRecord({ id: "b", title: "B" });
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 2, "Two records should be present");
  assert.strictEqual(records[0].id, "b", "Newest should be first (unshift)");
  console.log("✓ save + unshift order");
}

// Test 3: saveRecord merges by id (upsert)
{
  const { svc } = await makeService();
  await svc.saveRecord({ id: "a", title: "A", status: "queued" });
  await svc.saveRecord({ id: "a", title: "A", status: "completed" });
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 1, "Same id should not duplicate");
  assert.strictEqual(records[0].status, "completed", "Fields should merge");
  console.log("✓ upsert by id");
}

// Test 4: history is capped at 100 records
{
  const { svc } = await makeService();
  for (let i = 0; i < 120; i++) {
    await svc.saveRecord({ id: `id-${i}`, title: `T${i}` });
  }
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 100, "History should be capped at 100");
  assert.strictEqual(records[0].id, "id-119", "Newest should be kept");
  console.log("✓ 100-record cap");
}

// Test 5: clear empties the file
{
  const { svc, file } = await makeService();
  await svc.saveRecord({ id: "a", title: "A" });
  await svc.clear();
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 0, "Clear should empty history");
  const raw = await fs.readFile(file, "utf8");
  assert.strictEqual(JSON.parse(raw).length, 0, "File should be empty after clear");
  console.log("✓ clear");
}

// Test 6: concurrent saves do not clobber (write-queue serialization)
{
  const { svc } = await makeService();
  const writes = [];
  for (let i = 0; i < 20; i++) {
    writes.push(svc.saveRecord({ id: `c-${i}`, title: `C${i}` }));
  }
  await Promise.all(writes);
  const records = await svc.loadHistory();
  assert.strictEqual(records.length, 20, "All 20 concurrent saves should persist");
  const ids = new Set(records.map((r) => r.id));
  assert.strictEqual(ids.size, 20, "No records should be lost to clobbering");
  console.log("✓ concurrent save serialization");
}

// Test 7: loadHistory supports offset pagination (newest first)
{
  const { svc } = await makeService();
  for (let i = 0; i < 15; i++) {
    await svc.saveRecord({ id: `p-${i}`, title: `T${i}` });
  }
  const page = await svc.loadHistory(10, 5);
  assert.strictEqual(page.length, 10, "Page should return exactly `limit` records");
  assert.strictEqual(page[0].id, "p-9", "Offset skips the newest records first");
  assert.strictEqual(page[9].id, "p-0", "Page should end at the oldest record");
  const beyond = await svc.loadHistory(10, 100);
  assert.strictEqual(beyond.length, 0, "Offset past the end returns an empty page");
  console.log("✓ offset pagination");
}

console.log("All historyService tests passed.");