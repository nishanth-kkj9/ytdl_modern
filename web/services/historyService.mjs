import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.mjs";

/**
 * historyService.mjs — storage abstraction for download history.
 *
 * Default implementation uses a JSON file (no native deps). To swap in
 * SQLite, Postgres, or anything else, implement the same interface
 * (init / loadHistory / saveRecord / clear) and export it here.
 */
class JsonHistoryService {
  constructor(filePath) {
    this.file = filePath;
    this.records = [];
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const data = JSON.parse(raw);
      this.records = Array.isArray(data) ? data : [];
    } catch {
      this.records = [];
    }
    return this;
  }

  async loadHistory(limit = 100) {
    return this.records.slice(0, limit);
  }

  async saveRecord(record) {
    const idx = this.records.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.records[idx] = { ...this.records[idx], ...record };
    } else {
      this.records.unshift(record);
    }
    // Cap history at 100 records to prevent unbounded file growth.
    if (this.records.length > 100) {
      this.records = this.records.slice(0, 100);
    }
    await fs.writeFile(this.file, JSON.stringify(this.records, null, 2), "utf8");
    return record;
  }

  async clear() {
    this.records = [];
    await fs.writeFile(this.file, JSON.stringify([], null, 2), "utf8");
  }
}

// Export the active implementation. Swap here to change storage backend.
export const historyService = new JsonHistoryService(config.historyFile);
