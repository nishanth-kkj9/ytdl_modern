import { useState } from "react";
import { useDownloadStore } from "../stores/downloadStore";

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])/i;

const audioFormats = [
  { value: "mp3", label: "MP3" },
  { value: "opus", label: "Opus" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "wav", label: "WAV" },
];

const videoFormats = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mkv", label: "MKV" },
];

const audioQualities = [
  { value: "maximum", label: "Maximum (best available)" },
  { value: "high", label: "High (192k)" },
  { value: "medium", label: "Medium (128k)" },
  { value: "low", label: "Low (96k)" },
];

const videoQualities = [
  { value: "best", label: "Best available" },
  { value: "2160p", label: "4K (2160p)" },
  { value: "1080p", label: "1080p Full HD" },
  { value: "720p", label: "720p HD" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
];

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const probeInfo = useDownloadStore((state) => state.probeInfo);
  const probeError = useDownloadStore((state) => state.probeError);
  const statusMessage = useDownloadStore((state) => state.statusMessage);
  const selectedMode = useDownloadStore((state) => state.selectedMode);
  const selectedFormat = useDownloadStore((state) => state.selectedFormat);
  const selectedQuality = useDownloadStore((state) => state.selectedQuality);
  const setSelectedMode = useDownloadStore((state) => state.setSelectedMode);
  const setSelectedFormat = useDownloadStore((state) => state.setSelectedFormat);
  const setSelectedQuality = useDownloadStore((state) => state.setSelectedQuality);
  const queue = useDownloadStore((state) => state.queue);
  const probeUrl = useDownloadStore((state) => state.probeUrl);
  const enqueueDownload = useDownloadStore((state) => state.enqueueDownload);
  const setProbeInfo = useDownloadStore((state) => state.setProbeInfo);

  const isValid = YOUTUBE_REGEX.test(url.trim());
  const isAudio = selectedMode === "audio";
  const formats = isAudio ? audioFormats : videoFormats;
  const qualities = isAudio ? audioQualities : videoQualities;
  const activeCount = queue.filter((i) => i.status === "downloading").length;
  const queuedCount = queue.filter((i) => i.status === "queued").length;

  const handleProbe = async () => {
    if (!isValid || probing) return;
    setProbing(true);
    try {
      await probeUrl(url.trim());
    } finally {
      setProbing(false);
    }
  };

  const handleAdd = async () => {
    if (!isValid) return;
    const meta = probeInfo ? {
      title: probeInfo.title,
      uploader: probeInfo.uploader,
      description: probeInfo.description,
      thumbnail: probeInfo.thumbnail,
      duration: probeInfo.duration,
      webpage_url: probeInfo.url,
    } : undefined;
    await enqueueDownload(url.trim(), selectedFormat, selectedQuality, selectedMode, meta);
    setUrl("");
    setProbeInfo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleProbe();
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="p-5">
        <label htmlFor="url-input" className="sr-only">YouTube URL</label>
        <div className="flex items-center gap-3">
          <div
            className={`flex flex-1 items-center gap-3 rounded-2xl border bg-bg px-4 py-3 transition-all duration-200 ${
              isValid
                ? "border-accent-video/30 shadow-[0_0_20px_rgba(0,184,212,0.04)]"
                : "border-border"
              }
              ${url
                ? (isAudio
                    ? "focus-within:border-accent-audio/40 focus-within:shadow-[0_0_0_4px_rgba(245,158,11,0.04)]"
                    : "focus-within:border-accent-video/40 focus-within:shadow-[0_0_0_4px_rgba(0,184,212,0.04)]")
                : "focus-within:border-accent-video/30 focus-within:shadow-[0_0_0_4px_rgba(0,184,212,0.04)]"
              }`}
          >
            <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <input
              id="url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste YouTube URL..."
              aria-invalid={!isValid && url.length > 0}
              aria-describedby="url-status"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            />
            {url && (
              <button
                type="button"
                aria-label="Clear URL"
                onClick={() => setUrl("")}
                className="flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:bg-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-video/60"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={!isValid}
            onClick={handleProbe}
            aria-busy={probing}
            className="btn btn-ghost shrink-0"
          >
            {probing ? (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" className="opacity-75" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            {probing ? "Probing..." : "Probe"}
          </button>

          <button
            type="button"
            disabled={!isValid}
            onClick={handleAdd}
            className={`btn shrink-0 ${isAudio ? "btn-audio" : "btn-video"}`}
            title={probeInfo ? "Add to queue with selected format" : "Quick-add (no probe metadata)"}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="sr-only" id="mode-label">Download mode</div>
          <div role="radiogroup" aria-labelledby="mode-label" className="relative flex items-center gap-1 rounded-2xl bg-bg/70 p-1 ring-1 ring-white/5">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-1 w-[calc(50%-4px)] rounded-xl transition-all duration-200 ease-out ${
                isAudio
                  ? "left-1 bg-accent-audio/20 shadow-[0_0_0_1px_rgba(245,158,11,0.3),0_0_20px_rgba(245,158,11,0.12)]"
                  : "left-[calc(50%)] bg-accent-video/20 shadow-[0_0_0_1px_rgba(0,184,212,0.3),0_0_20px_rgba(0,184,212,0.12)]"
              }`}
            />
            <button
              type="button"
              role="radio"
              aria-checked={isAudio}
              onClick={() => setSelectedMode("audio")}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
                isAudio ? "text-accent-audio" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              Audio
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isAudio}
              onClick={() => setSelectedMode("video")}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
                !isAudio ? "text-accent-video" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Video
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex">
            <label className="flex flex-1 flex-col gap-1 sm:flex-none">
              <span className="eyebrow">Format</span>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="select-input w-full sm:w-40"
                aria-label="Format"
              >
                {formats.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 sm:flex-none">
              <span className="eyebrow">Quality</span>
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="select-input w-full sm:w-40"
                aria-label="Quality"
              >
                {qualities.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div
          id="url-status"
          aria-live="polite"
          className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-bg/50 px-4 py-2.5"
        >
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{statusMessage || (probing ? "Probing URL..." : "Paste a link to probe")}</span>
          </div>
          <span className="text-[10px] font-medium tracking-wider text-text-muted uppercase">ytdl_modern</span>
        </div>

        {queue.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-bg/50 px-4 py-2.5 text-xs">
            <span className="text-text-muted">{queuedCount > 0 || activeCount > 0 ? `${queuedCount > 0 ? `${queuedCount} queued` : ""}${queuedCount > 0 && activeCount > 0 ? " · " : ""}${activeCount > 0 ? `${activeCount} downloading` : ""}` : `${queue.length} pending`}</span>
            <span className="text-text-muted tabular-nums">{queue.length} in queue</span>
          </div>
        )}

        {probeError && (
          <div role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-3">
            <p className="text-xs font-semibold text-error">Probe failed</p>
            <p className="mt-1 text-xs text-error/90">{probeError}</p>
          </div>
        )}
      </div>
    </section>
  );
}
