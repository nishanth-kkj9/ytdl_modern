import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();

vi.mock("../api/transport", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  listen: vi.fn(async () => () => {}),
  openPath: vi.fn(async () => {}),
}));

import { useDownloadStore } from "./downloadStore";

describe("downloadStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue({});
    // Reset store to a clean initial state between tests.
    useDownloadStore.setState({
      queue: [],
      history: [],
      probeInfo: null,
      probeError: null,
      engineStatus: "starting",
      statusMessage: "",
      logs: [],
      metadataResult: null,
      _logSeq: 0,
    });
  });

  it("enqueueDownload adds a queued item and starts it", async () => {
    await useDownloadStore.getState().enqueueDownload(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "mp3",
      "high",
      "audio"
    );
    const s = useDownloadStore.getState();
    expect(s.queue.length).toBe(1);
    expect(s.queue[0].status).toBe("downloading");
    expect(s.queue[0].title).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(invoke).toHaveBeenCalledWith("start_download", expect.anything());
  });

  it("cancelDownload marks the item cancelled", async () => {
    useDownloadStore.setState({
      queue: [
        {
          id: "d1",
          url: "https://example.com",
          title: "T",
          format: "mp3",
          quality: "high",
          status: "downloading",
          progress: 10,
          downloaded: 1,
          total: 10,
          speed: 1,
          type: "audio",
        },
      ],
    });
    await useDownloadStore.getState().cancelDownload("d1");
    expect(useDownloadStore.getState().queue[0].status).toBe("cancelled");
    expect(invoke).toHaveBeenCalledWith("cancel_download", { id: "d1" });
  });

  it("addHistoryItem dedupes by id and caps history at 100", () => {
    const add = useDownloadStore.getState().addHistoryItem;
    add({ id: "h1", title: "A", fmt: "mp3", size: "1", duration: "1", url: "", downloaded_at: "", filepath: "", type: "audio" });
    add({ id: "h1", title: "A", fmt: "mp3", size: "1", duration: "1", url: "", downloaded_at: "", filepath: "", type: "audio" });
    expect(useDownloadStore.getState().history.length).toBe(1);

    for (let i = 0; i < 120; i++) {
      useDownloadStore.getState().addHistoryItem({
        id: `h-${i}`,
        title: `T${i}`,
        fmt: "mp3",
        size: "1",
        duration: "1",
        url: "",
        downloaded_at: "",
        filepath: "",
        type: "audio",
      });
    }
    expect(useDownloadStore.getState().history.length).toBe(100);
  });

  it("cancelDownload surfaces a failed cancel in statusMessage", async () => {
    invoke.mockRejectedValueOnce(new Error("engine down"));
    useDownloadStore.setState({
      queue: [
        {
          id: "d2",
          url: "https://example.com",
          title: "T",
          format: "mp3",
          quality: "high",
          status: "downloading",
          progress: 10,
          downloaded: 1,
          total: 10,
          speed: 1,
          type: "audio",
        },
      ],
    });
    await useDownloadStore.getState().cancelDownload("d2");
    const s = useDownloadStore.getState();
    expect(s.statusMessage).toBe("Failed to cancel download.");
    expect(s.logs[0]?.level).toBe("error");
  });

  it("restartEngine invokes the restart command", async () => {
    await useDownloadStore.getState().restartEngine();
    expect(invoke).toHaveBeenCalledWith("restart_engine");
    expect(useDownloadStore.getState().engineStatus).toBe("starting");
  });
});