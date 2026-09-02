import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "./transport";

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
