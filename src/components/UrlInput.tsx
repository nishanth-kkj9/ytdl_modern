import { useState } from "react";
import { useDownloadStore } from "../stores/downloadStore";

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}/i;

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const probeInfo = useDownloadStore((state) => state.probeInfo);
  const probeError = useDownloadStore((state) => state.probeError);
  const statusMessage = useDownloadStore((state) => state.statusMessage);
  const selectedMode = useDownloadStore((state) => state.selectedMode);
  const selectedFormat = useDownloadStore((state) => state.selectedFormat);
  const selectedQuality = useDownloadStore((state) => state.selectedQuality);
  const probeUrl = useDownloadStore((state) => state.probeUrl);
  const enqueueDownload = useDownloadStore((state) => state.enqueueDownload);

  const isValid = YOUTUBE_REGEX.test(url.trim());
  const isAudio = selectedMode === "audio";

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
            className={`btn shrink-0 ${isAudio ? "btn-audio" : "btn-video"}`}
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
