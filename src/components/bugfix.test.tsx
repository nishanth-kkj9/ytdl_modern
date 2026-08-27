import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SidebarItem } from "./SidebarItem";
import { LogPanel } from "./LogPanel";

// BUG-02: progress 0..1 must render as percent, not 0..1%
describe("BUG-02 SidebarItem progress", () => {
  it("renders 50% width for progress 0.5", () => {
    const item = {
      id: "1",
      url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Test",
      format: "mp3",
      quality: "high",
      status: "downloading" as const,
      progress: 0.5,
      downloaded: 500,
      total: 1000,
      speed: 100,
      type: "audio" as const,
    };
    const { container } = render(<SidebarItem item={item} />);
    const bar = container.querySelector('[style*="width"]') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe("50%");
  });
  it("renders 100% for progress 1", () => {
    const item = {
      id: "2",
      url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Test",
      format: "mp3",
      quality: "high",
      status: "downloading" as const,
      progress: 1,
      downloaded: 1000,
      total: 1000,
      speed: 100,
      type: "audio" as const,
    };
    const { container } = render(<SidebarItem item={item} />);
    const bar = container.querySelector('[style*="width"]') as HTMLElement | null;
    expect(bar!.style.width).toBe("100%");
  });
});

// BUG-01: LogPanel must not have nested button
describe("BUG-01 LogPanel no nested button", () => {
  it("has no button inside button", () => {
    const { container } = render(<LogPanel />);
    const nested = container.querySelector("button button");
    expect(nested).toBeNull();
  });
});
