import { invoke } from "../api/transport";
import { create } from "zustand";
import { DownloadItem, HistoryItem, MetadataResult, ProbeInfo } from "../types";

// Generate a unique ID (crypto.randomUUID is collision-free and available in
// all modern browsers).
function generateId(): string {
  return crypto.randomUUID();
}

export interface LogEntry {
  message: string;
  level: "info" | "warn" | "error";
}

interface Metadata {
  title?: string;
  uploader?: string;
  description?: string;
  thumbnail?: string;
  duration?: number;
  webpage_url?: string;
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
  metadataResult: MetadataResult | null;
  enqueueDownload: (url: string, format: string, quality: string, type: "audio" | "video", meta?: Metadata) => Promise<void>;
  startDownload: (id: string, meta?: Metadata) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  probeUrl: (url: string) => Promise<void>;
  setSelectedMode: (mode: "audio" | "video") => void;
  setSelectedFormat: (format: string) => void;
  setSelectedQuality: (quality: string) => void;
  setProbeInfo: (info: ProbeInfo | null) => void;
  setEngineStatus: (status: EngineStatus) => void;
  setMetadataResult: (result: MetadataResult | null) => void;
  addLog: (message: string, level?: "info" | "warn" | "error") => void;
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
  metadataResult: null,

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
    }
  },

  retryDownload: async (id) => {
    const item = get().queue.find((queueItem) => queueItem.id === id);
    if (!item) return;
    get().updateQueueItem(id, { status: "queued", progress: 0, message: "Retrying..." });
    const p = get().probeInfo;
    const meta: Metadata = p ? { title: p.title, uploader: p.uploader, description: p.description, thumbnail: p.thumbnail, duration: p.duration, webpage_url: p.url } : {};
    await get().startDownload(id, meta);
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
  setMetadataResult: (result) => set({ metadataResult: result }),
  addLog: (message, level = "info") => set((state) => ({ logs: [{ message, level }, ...state.logs].slice(0, 50) })),
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
      console.error("Failed to load history:", e);
    }
  },
  clearHistory: async () => {
    try {
      await invoke("clear_history");
      set({ history: [] });
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  },
}));
