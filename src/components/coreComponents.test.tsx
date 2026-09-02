import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UrlInput } from "./UrlInput";
import { ProbeCard } from "./ProbeCard";
import { WaveformProgress } from "./WaveformProgress";
import { MetadataPanel } from "./MetadataPanel";
import { useDownloadStore } from "../stores/downloadStore";

beforeEach(() => {
  useDownloadStore.setState({ queue: [], probeInfo: null, probeError: null, metadataResult: null, statusMessage: "" });
});

describe("TEST-01 core component coverage", () => {
  it("probes a valid URL from UrlInput", async () => {
    const probeUrl = vi.fn().mockResolvedValue(undefined);
    useDownloadStore.setState({ probeUrl });
    render(<UrlInput />);
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByRole("button", { name: "Probe" }));
    expect(probeUrl).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ");
  });

  it("expands ProbeCard formats", () => {
    render(<ProbeCard info={{ id: "p", title: "T", uploader: "U", duration: 1, url: "u", formats: [{ format_id: "1", ext: "mp3", acodec: "mp3" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: /1 formats available/i }));
    expect(screen.getAllByText("mp3")).toHaveLength(2);
  });

  it("removes completed items from WaveformProgress", () => {
    useDownloadStore.setState({ queue: [{ id: "d", url: "u", title: "T", format: "mp3", quality: "high", status: "downloading", progress: 0, downloaded: 0, total: 0, speed: 0, type: "audio" }] });
    render(<WaveformProgress />);
    expect(screen.getByLabelText("Downloading T")).toBeInTheDocument();
    act(() => useDownloadStore.setState({ queue: [{ ...useDownloadStore.getState().queue[0], status: "completed" }] }));
    expect(screen.queryByLabelText("Downloading T")).toBeNull();
  });

  it("expands a long metadata description", () => {
    const description = "x".repeat(130);
    useDownloadStore.setState({ metadataResult: { fields: { title: "T", description }, verify: { title: true }, engine: "yt-dlp", container: "mp3", cover_art: false } });
    render(<MetadataPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Show More" }));
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it("does not attach stale probe metadata after the URL was edited (REV-01)", async () => {
    const enqueueDownload = vi.fn().mockResolvedValue(undefined);
    useDownloadStore.setState({
      enqueueDownload,
      // Probe metadata captured for URL A…
      probeInfo: {
        id: "a",
        title: "Video A title",
        uploader: "Channel A",
        duration: 120,
        url: "https://youtu.be/AAAAAAAAAAA",
        thumbnail: "https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg",
      },
    });
    render(<UrlInput />);
    // …then the user edits the input to URL B before clicking Add.
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const [, , , , meta] = enqueueDownload.mock.calls[0];
    expect(meta).toBeUndefined();
  });

  it("displays the EMA-smoothed speed, not the raw spike (REV-02)", () => {
    useDownloadStore.setState({
      queue: [{
        id: "d", url: "u", title: "T", format: "mp3", quality: "high",
        status: "downloading", progress: 0.1, downloaded: 100, total: 1000,
        // First frame: previous EMA is 0 → 0.3 * 100 = 30.
        speed: 100, type: "audio",
      }],
    });
    render(<WaveformProgress />);
    expect(screen.getByText("30 B/s")).toBeInTheDocument();
    expect(screen.queryByText("100 B/s")).toBeNull();
  });
});
