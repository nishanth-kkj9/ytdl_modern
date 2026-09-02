import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastContainer } from "./ToastContainer";
import { useDownloadStore } from "../stores/downloadStore";

describe("ToastContainer", () => {
  beforeEach(() => {
    useDownloadStore.setState({ toasts: [] });
    vi.useRealTimers();
  });

  it("renders nothing when the toast list is empty", () => {
    render(<ToastContainer />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders one toast per entry with the right type class", () => {
    act(() => {
      useDownloadStore.getState().addToast("Download complete", "success");
    });
    render(<ToastContainer />);
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("toast-success");
    expect(screen.getByText("Download complete")).toBeTruthy();
    expect(screen.getByText("Success")).toBeTruthy();
  });

  it("renders multiple toasts and respects the 5-item cap", () => {
    act(() => {
      for (let i = 0; i < 7; i++) {
        useDownloadStore.getState().addToast(`msg-${i}`, "info", 0);
      }
    });
    const { toasts } = useDownloadStore.getState();
    expect(toasts.length).toBe(5);
    expect(toasts[0].message).toBe("msg-6"); // newest first
  });

  it("auto-dismisses a toast after the duration elapses", () => {
    vi.useFakeTimers();
    act(() => {
      useDownloadStore.getState().addToast("Transient", "warning", 3000);
    });
    expect(useDownloadStore.getState().toasts.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(useDownloadStore.getState().toasts.length).toBe(0);
  });

  it("keeps a persistent toast (duration 0) until manually dismissed", () => {
    vi.useFakeTimers();
    let id = "";
    act(() => {
      id = useDownloadStore.getState().addToast("Sticky", "error", 0);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(useDownloadStore.getState().toasts.some((t) => t.id === id)).toBe(true);
    act(() => {
      useDownloadStore.getState().removeToast(id);
    });
    expect(useDownloadStore.getState().toasts.length).toBe(0);
  });

  it("dismisses via the close button click", () => {
    let id = "";
    act(() => {
      id = useDownloadStore.getState().addToast("Click to dismiss", "info");
    });
    render(<ToastContainer />);
    const closeBtn = screen.getByRole("button", { name: /dismiss info notification/i });
    act(() => {
      closeBtn.click();
    });
    expect(useDownloadStore.getState().toasts.some((t) => t.id === id)).toBe(false);
  });
});
