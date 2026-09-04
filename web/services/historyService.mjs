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
// Export the class too so tests can instantiate isolated instances
// (the singleton below is bound to the real config path).
export class JsonHistoryService {
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
    } catch (err) {
      // Missing file is the normal first-run path — reset silently. Any other
      // failure (invalid JSON, permission error, directory in the way) is
      // corruption and must never be silently overwritten (PR-01): preserve
      // the original bytes in a timestamped .corrupt-<ts> backup before any
      // future save can replace them, and log loudly so it's never silent.
      if (err?.code !== "ENOENT") {
        console.error("[historyService] History file is corrupt/unreadable:", err?.message);
        try {
          const backup = `${this.file}.corrupt-${Date.now()}`;
          await fs.copyFile(this.file, backup);
          console.warn(`[historyService] Corrupt history preserved at ${backup}`);
        } catch (backupErr) {
          console.error("[historyService] Could not back up corrupt history:", backupErr);
        }
      }
      this.records = [];
    }
    return this;
  }

  /**
   * Load history records, newest first, with optional pagination.
   * @param {number} limit Max records to return (default 100).
   * @param {number} offset Skip the first `offset` newest-first records.
   */
  async loadHistory(limit = 100, offset = 0) {
    return this.records.slice(offset, offset + limit);
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
      let next;
      if (idx >= 0) {
        next = this.records.slice();
        next[idx] = { ...next[idx], ...record };
      } else {
        next = [record, ...this.records];
      }
      // Cap history at 100 records to prevent unbounded file growth.
      if (next.length > 100) {
        next = next.slice(0, 100);
      }
      await this._writeFile(JSON.stringify(next, null, 2));
      // Commit to memory only AFTER the write succeeded — a failed write
      // used to leave memory and disk diverged until restart.
      this.records = next;
    });

    // Keep the queue alive even if one write fails.
    this._writeQueue = task.catch((err) => {
      console.error("[historyService] History write failed:", err);
    });

    await task;
    return record;
  }

  async clear() {
    // Mirror saveRecord's catch-recovery: without it, a failed clear left
    // _writeQueue REJECTED forever, and every subsequent saveRecord silently
    // chained onto the rejected promise — records were never written again
    // (confirmed by repro: record 'b' was permanently lost after a failed
    // clear). The catch resets the chain so the next write goes through.
    const task = this._writeQueue.then(async () => {
      const next = [];
      await this._writeFile(JSON.stringify(next, null, 2));
      this.records = next;
    });
    this._writeQueue = task.catch((err) => {
      console.error("[historyService] History clear failed:", err);
    });
    await task;
  }
}

// Export the active implementation. Swap here to change storage backend.
export const historyService = new JsonHistoryService(config.historyFile);
