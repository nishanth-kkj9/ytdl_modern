import { invoke } from "../api/transport";
import { create } from "zustand";
import { DownloadItem, HistoryItem, Metadata, MetadataResult, ProbeInfo } from "../types";

// Generate a unique ID (crypto.randomUUID is collision-free and available in
// all modern browsers).
function generateId(): string {
  return crypto.randomUUID();
}

export interface LogEntry {
  /** Monotonic id — used as a stable React key (was array index). */
  _seq: number;
  message: string;
  level: "info" | "warn" | "error";
  /** Epoch milliseconds when the entry was created — shown as a timestamp. */
  timestamp: number;
  /** Optional download/engine id extracted from the message for correlation. */
  refId?: string;
}

export type LogLevel = LogEntry["level"];

/** Extracts a download UUID from a log message if present (for correlation). */
function extractRefId(message: string): string | undefined {
  const match = message.match(
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
  );
  return match?.[1];
}

export type EngineStatus = "starting" | "ready" | "error";

interface DownloadState {
  queue: DownloadItem[];
  history: HistoryItem[];
  probeInfo: ProbeInfo | null;
  probeError: string | null;
  engineStatus: EngineStatus;
  selectedMode: "audio" | "video";
  selectedFormat: string;
  selectedQuality: string;
  statusMessage: string;
  logs: LogEntry[];
  /** True while the WebSocket to the server is connected (header indicator). */
  wsConnected: boolean;
  metadataResult: MetadataResult | null;
  /** Monotonic counter backing LogEntry._seq (stable React keys). */
  _logSeq: number;
  enqueueDownload: (url: string, format: string, quality: string, type: "audio" | "video", meta?: Metadata) => Promise<void>;
  startDownload: (id: string, meta?: Metadata) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  restartEngine: () => Promise<void>;
  probeUrl: (url: string) => Promise<void>;
  setSelectedMode: (mode: "audio" | "video") => void;
  setSelectedFormat: (format: string) => void;
  setSelectedQuality: (quality: string) => void;
  setProbeInfo: (info: ProbeInfo | null) => void;
  setEngineStatus: (status: EngineStatus) => void;
  setStatusMessage: (message: string) => void;
  setMetadataResult: (result: MetadataResult | null) => void;
  addLog: (message: string, level?: "info" | "warn" | "error") => void;
  clearLogs: () => void;
  setWsConnected: (connected: boolean) => void;
  updateQueueItem: (id: string, patch: Partial<DownloadItem>) => void;
  addHistoryItem: (record: HistoryItem) => void;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  queue: [],
  history: [],
  probeInfo: null,
  probeError: null,
  engineStatus: "starting",
  selectedMode: "audio",
  selectedFormat: "mp3",
  selectedQuality: "high",
  statusMessage: "",
  logs: [],
  wsConnected: false,
  metadataResult: null,
  // Monotonic counter backing LogEntry._seq (never reset, so keys stay unique
  // even after the log list is trimmed by the 50-entry cap).
  _logSeq: 0,

  enqueueDownload: async (url, format, quality, type, meta) => {
    set({ statusMessage: "Queuing download..." });
    try {
      const id = generateId();
      set((state) => ({
        queue: [
          ...state.queue,
          {
            id,
            url,
            title: meta?.title || url,
            format,
            quality,
            status: "queued",
            progress: 0,
            downloaded: 0,
            total: 0,
            speed: 0,
            type,
            thumbnail: meta?.thumbnail,
            metadata: meta,
          },
        ],
      }));
      get().addLog(`Download queued: ${url}`);
      await get().startDownload(id, meta);
    } catch (error) {
      set({ statusMessage: "Failed to queue download." });
      get().addLog(`enqueueDownload error: ${String(error)}`, "error");
    }
  },

  startDownload: async (id, meta) => {
    const item = get().queue.find((queueItem) => queueItem.id === id);
    if (!item) {
      get().addLog(`startDownload failed: item not found ${id}`, "error");
      return;
    }

    try {
      set({ statusMessage: "Starting download..." });
      await invoke("start_download", {
        url: item.url,
        format: item.format,
        quality: item.quality,
        mode: item.type,
        id: item.id,
        title: meta?.title || null,
        uploader: meta?.uploader || null,
        description: meta?.description || null,
        thumbnail: meta?.thumbnail || null,
        duration: meta?.duration ?? null,
        webpage_url: meta?.webpage_url || null,
      });
      get().updateQueueItem(id, { status: "downloading", message: "Starting" });
      get().addLog(`Download started: ${item.url}`);
    } catch (error) {
      get().addLog(`start_download error: ${String(error)}`, "error");
      get().updateQueueItem(id, { status: "failed", message: "Failed to start" });
      set({ statusMessage: "Download failed to start." });
    }
  },

  cancelDownload: async (id) => {
    try {
      await invoke("cancel_download", { id });
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? { ...item, status: "cancelled", message: "Cancel requested" }
            : item,
        ),
      }));
      get().addLog(`Cancel requested: ${id}`);
    } catch (error) {
      get().addLog(`cancel_download error: ${String(error)}`, "error");
      set({ statusMessage: "Failed to cancel download." });
    }
  },

  retryDownload: async (id) => {
    const item = get().queue.find((queueItem) => queueItem.id === id);
    if (!item) return;
    get().updateQueueItem(id, { status: "queued", progress: 0, message: "Retrying..." });
    // Use the metadata captured at enqueue time, not the global probeInfo,
    // which may now point at a different URL the user probed more recently.
    await get().startDownload(id, item.metadata);
  },

  restartEngine: async () => {
    set({ statusMessage: "Restarting engine...", engineStatus: "starting" });
    try {
      await invoke("restart_engine");
      get().addLog("Engine restart requested");
    } catch (error) {
      get().addLog(`restart_engine error: ${String(error)}`, "error");
      set({ statusMessage: "Engine restart failed." });
    }
  },

  probeUrl: async (url) => {
    set({ statusMessage: "Probing URL...", probeInfo: null, probeError: null });
    try {
      await invoke("probe_url", { url });
      get().addLog(`Probe requested: ${url}`);
    } catch (error) {
      set({ statusMessage: "Probe failed.", probeError: String(error) });
      get().addLog(`probe_url error: ${String(error)}`, "error");
    }
  },

  setSelectedMode: (mode) => set({
    selectedMode: mode,
    selectedFormat: mode === "audio" ? "mp3" : "mp4",
    selectedQuality: mode === "audio" ? "high" : "best",
  }),
  setSelectedFormat: (format) => set({ selectedFormat: format }),
  setSelectedQuality: (quality) => set({ selectedQuality: quality }),
  setProbeInfo: (info) => set({ probeInfo: info, probeError: null }),
  setEngineStatus: (engineStatus) => set({ engineStatus }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setMetadataResult: (result) => set({ metadataResult: result }),
  addLog: (message, level = "info") => set((state) => {
    // Drop exact duplicates of the most recent entry. React StrictMode mounts
    // effects twice in development, so every engine event used to be handled
    // (and logged) by two live subscriptions — doubling log lines.
    if (state.logs[0]?.message === message) return state;
    const seq = state._logSeq + 1;
    return {
      _logSeq: seq,
      logs: [
        { _seq: seq, message, level, timestamp: Date.now(), refId: extractRefId(message) },
        ...state.logs,
      ].slice(0, 50),
    };
  }),
  // Wipes the visible log. _logSeq stays monotonic so React keys never collide.
  clearLogs: () => set({ logs: [] }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  updateQueueItem: (id, patch) => set((state) => ({
    queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  })),
  addHistoryItem: (record) => {
    set((state) => {
      if (state.history.some((h) => h.id === record.id)) return state;
      const nextHistory = [record, ...state.history].slice(0, 100);
      invoke("save_history", { record }).catch((err) => {
        get().addLog(`History save failed: ${String(err)}`, "warn");
      });
      return {
        history: nextHistory,
        queue: state.queue.filter((item) => item.id !== record.id),
      };
    });
  },
  loadHistory: async () => {
    try {
      const records = await invoke<HistoryItem[]>("load_history");
      set({ history: records });
    } catch (e) {
      // Surface history load failures instead of failing silently — the
      // drawer shows stale "No downloads yet" otherwise.
      console.error("Failed to load history:", e);
      get().addLog(`Failed to load history: ${String(e)}`, "warn");
      set({ statusMessage: "Failed to load history." });
    }
  },
  clearHistory: async () => {
    try {
      await invoke("clear_history");
      set({ history: [] });
    } catch (e) {
      console.error("Failed to clear history:", e);
      get().addLog(`Failed to clear history: ${String(e)}`, "warn");
      set({ statusMessage: "Failed to clear history." });
    }
  },
}));
