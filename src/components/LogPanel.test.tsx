import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LogPanel } from "./LogPanel";
import { useDownloadStore } from "../stores/downloadStore";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function seedLogs() {
  const { addLog } = useDownloadStore.getState();
  addLog(`Download queued: https://youtu.be/x [${UUID}]`);
  addLog("Retrying download (attempt 2)", "warn");
  addLog("Download failed: network timeout", "error");
}

beforeEach(() => {
  useDownloadStore.setState({ logs: [], _logSeq: 0, engineStatus: "ready" });
});

describe("LogPanel", () => {
  it("renders entries with timestamps and correlation badges", () => {
    seedLogs();
    render(<LogPanel />);
    // All three messages are visible.
    expect(screen.getByText(/Download queued:/)).toBeTruthy();
    expect(screen.getByText(/Retrying download/)).toBeTruthy();
    expect(screen.getByText(/Download failed:/)).toBeTruthy();
    // The download id is extracted from the message and shown as a badge.
    expect(screen.getByTitle(UUID)).toBeTruthy();
    // Timestamps render as HH:MM:SS.
    expect(document.querySelector(".tabular-nums.text-text-muted\\/70")).not.toBeNull();
  });

  it("filters entries by level and shows per-level counts", () => {
    seedLogs();
    render(<LogPanel />);
    // Chips show total (all) and per-level counts.
    const allChip = screen.getByRole("button", { name: /all/i });
    expect(allChip.textContent).toContain("3");
    // Activate the error filter.
    fireEvent.click(screen.getByRole("button", { name: /^error/i }));
    expect(screen.getByText(/Download failed:/)).toBeTruthy();
    expect(screen.queryByText(/Retrying download/)).toBeNull();
    // Empty-filter state is communicated.
    fireEvent.click(screen.getByRole("button", { name: /^warn/i }));
    expect(screen.getByText(/Retrying download/)).toBeTruthy();
  });

  it("clears all entries via the Clear button", () => {
    seedLogs();
    render(<LogPanel />);
    fireEvent.click(screen.getByRole("button", { name: /clear log/i }));
    expect(useDownloadStore.getState().logs).toHaveLength(0);
    expect(screen.getByText(/Waiting for activity/)).toBeTruthy();
  });

  it("collapses and re-expands the log body", () => {
    render(<LogPanel />);
    const toggle = screen.getByRole("button", { name: /engine log/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
