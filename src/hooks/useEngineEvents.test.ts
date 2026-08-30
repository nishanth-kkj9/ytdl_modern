import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Captured "engine-event" handler — set once the hook's async subscription
// resolves. Wrapped in vi.hoisted so the vi.mock factory can reference it.
const captured = vi.hoisted(() => ({
  handler: null as null | ((message: { type: string; payload: Record<string, unknown> }) => void),
}));

vi.mock("../api/transport", () => ({
  listen: vi.fn(async (_event: string, handler: (message: { type: string; payload: Record<string, unknown> }) => void) => {
    captured.handler = handler;
    return () => {};
  }),
  invoke: vi.fn(async (command: string) => {
    if (command === "get_download_dir") return "D:/proj/downloads";
    return {};
  }),
}));

import { useDownloadStore } from "../stores/downloadStore";
import { useEngineEvents } from "./useEngineEvents";

// Simulate a WS message exactly as the server broadcasts it: the transport
// hands the full { type, payload } envelope to the wildcard handler.
function emit(type: string, payload: Record<string, unknown>) {
  captured.handler?.({ type, payload });
}

async function setup() {
  renderHook(() => useEngineEvents());
  await waitFor(() => expect(captured.handler).not.toBeNull());
}

describe("useEngineEvents — engine status flow", () => {
  beforeEach(() => {
    captured.handler = null;
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

  it("marks the engine ready from the on-connect snapshot", async () => {
    // Server's synthetic on-connect message: payload now carries `type`
    // (the historical bug — without it the badge stayed on "starting").
    await setup();
    emit("engine_ready", { type: "engine_ready", ready: true });
    expect(useDownloadStore.getState().engineStatus).toBe("ready");
  });

  it("returns to ready after an engine restart (no once-only gate)", async () => {
    await setup();
    emit("engine_ready", { type: "engine_ready", ready: true });
    expect(useDownloadStore.getState().engineStatus).toBe("ready");

    // Simulate restartEngine(): status flips back to "starting"…
    useDownloadStore.getState().setEngineStatus("starting");
    // …and the follow-up engine_ready must be honored (previously ignored
    // by hasSeenReadyRef, leaving the badge stuck on "starting" forever).
    emit("engine_ready", { type: "engine_ready", ready: true });
    expect(useDownloadStore.getState().engineStatus).toBe("ready");
  });

  it("reflects engine_crashed as a transient starting state", async () => {
    await setup();
    emit("engine_ready", { type: "engine_ready", ready: true });
    expect(useDownloadStore.getState().engineStatus).toBe("ready");
    emit("engine_crashed", { type: "engine_crashed" });
    expect(useDownloadStore.getState().engineStatus).toBe("starting");
  });
});

describe("useEngineEvents — status message flow", () => {
  beforeEach(() => {
    captured.handler = null;
    useDownloadStore.setState({
      queue: [],
      history: [],
      probeInfo: null,
      probeError: null,
      engineStatus: "starting",
      statusMessage: "Starting download...",
      logs: [],
      metadataResult: null,
      _logSeq: 0,
    });
  });

  it("clears the stuck 'Starting download...' message on success", async () => {
    await setup();
    emit("result", {
      type: "result",
      id: "d1",
      success: true,
      title: "T",
      fmt: "mp3",
      filepath: "D:/proj/downloads/x.mp3",
      file_size: 10,
      duration: 5,
      url: "u",
    });
    expect(useDownloadStore.getState().statusMessage).toBe("Download completed.");
  });

  it("sets a failure message on error result", async () => {
    await setup();
    emit("result", { type: "result", id: "d1", success: false, error: "boom" });
    expect(useDownloadStore.getState().statusMessage).toBe("Download failed.");
  });

  it("sets a message on cancelled and engine error events", async () => {
    await setup();
    emit("cancelled", { type: "cancelled", id: "d1" });
    expect(useDownloadStore.getState().statusMessage).toBe("Download cancelled.");
    emit("error", { type: "error", id: "d1", error: "x" });
    expect(useDownloadStore.getState().statusMessage).toBe("Download failed.");
  });

  it("updates the message when a probe result arrives", async () => {
    await setup();
    emit("probe_result", {
      type: "probe_result",
      id: "p1",
      success: true,
      info: { title: "T", uploader: "U", duration: 10, thumbnail: "", webpage_url: "w", formats: [] },
    });
    expect(useDownloadStore.getState().statusMessage).toBe("Probe complete.");
    expect(useDownloadStore.getState().probeInfo?.title).toBe("T");
  });
});
