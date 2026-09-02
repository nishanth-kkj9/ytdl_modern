import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, getConnectionState, onConnectionChange } from "./transport";

describe("web transport errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("surfaces an API error field instead of its raw JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Only YouTube URLs are supported" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )));

    await expect(invoke("probe_url", { url: "https://example.com" }))
      .rejects.toThrowError(new Error("Only YouTube URLs are supported"));
  });

  it("keeps a non-JSON error body as the fallback message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Gateway unavailable", { status: 503 })));

    await expect(invoke("probe_url", { url: "https://example.com" }))
      .rejects.toThrow("Gateway unavailable");
  });
});

// ── WS connection-state tracking ─────────────────────────────────────────────
// Minimal fake WebSocket: records handlers so tests can drive the lifecycle.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((msg: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
}

describe("transport connection state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it("transitions connecting → connected → disconnected and notifies handlers", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const states: string[] = [];
    const unlisten = onConnectionChange((s) => states.push(s));

    // Initial state before any socket exists.
    expect(getConnectionState()).toBe("connecting");

    // ensureWebSocket() is private — listen() triggers it.
    const { listen } = await import("./transport");
    await listen("engine-event", () => {});
    expect(getConnectionState()).toBe("connecting");

    const sock = FakeWebSocket.instances[0];
    sock.onopen?.();
    expect(getConnectionState()).toBe("connected");

    sock.onclose?.();
    expect(getConnectionState()).toBe("disconnected");

    expect(states).toEqual(["connected", "disconnected"]);
    unlisten();
  });
});
