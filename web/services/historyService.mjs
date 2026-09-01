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
    // Serialize read-modify-write cycles so concurrent saveRecord calls cannot
    // clobber each other's writes (last-write-wins over the whole file).
    this._writeQueue = Promise.resolve();
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

  /**
   * Crash-safe write: write to a temp file first, then atomically rename it
   * over the target. A crash mid-write can only ever leave the temp file
   * behind — history.json itself stays valid (either old or new content),
   * never truncated/corrupt.
   */
  async _writeFile(content) {
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, this.file);
  }

  async saveRecord(record) {
    // Chain onto the queue: each save (mutation + file write) runs to
    // completion before the next one starts, preventing data loss.
    const task = this._writeQueue.then(async () => {
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
      await this._writeFile(JSON.stringify(this.records, null, 2));
    });

    // Keep the queue alive even if one write fails.
    this._writeQueue = task.catch((err) => {
      console.error("[historyService] History write failed:", err);
    });

    await task;
    return record;
  }

  async clear() {
    this._writeQueue = this._writeQueue.then(async () => {
      this.records = [];
      await this._writeFile(JSON.stringify([], null, 2));
    });
    await this._writeQueue;
  }
}

// Export the active implementation. Swap here to change storage backend.
export const historyService = new JsonHistoryService(config.historyFile);
