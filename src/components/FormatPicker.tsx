import { useDownloadStore } from "../stores/downloadStore";

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

export function FormatPicker() {
  const selectedMode = useDownloadStore((state) => state.selectedMode);
  const selectedFormat = useDownloadStore((state) => state.selectedFormat);
  const selectedQuality = useDownloadStore((state) => state.selectedQuality);
  const setSelectedMode = useDownloadStore((state) => state.setSelectedMode);
  const setSelectedFormat = useDownloadStore((state) => state.setSelectedFormat);
  const setSelectedQuality = useDownloadStore((state) => state.setSelectedQuality);

  const formats = selectedMode === "audio" ? audioFormats : videoFormats;
  const qualities = selectedMode === "audio" ? audioQualities : videoQualities;
  const isAudio = selectedMode === "audio";

  const formatLabel = formats.find((f) => f.value === selectedFormat)?.label ?? selectedFormat;
  const qualityLabel = qualities.find((q) => q.value === selectedQuality)?.label ?? selectedQuality;

  return (
    <section className={`rack-panel ${isAudio ? "rack-panel-glow-audio" : "rack-panel-glow-video"}`}>
      <div className="p-5">
        <div className="sr-only" id="mode-label">Download mode</div>
        <div role="radiogroup" aria-labelledby="mode-label" className="relative flex items-center gap-1 rounded-2xl bg-bg/70 p-1 ring-1 ring-white/5">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1 w-[calc(50%-4px)] rounded-xl transition-all duration-200 ease-out ${
              isAudio
                ? "left-1 bg-accent-audio-dim shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_20px_rgba(245,158,11,0.1)]"
                : "left-[calc(50%)] bg-accent-video-dim shadow-[0_0_0_1px_rgba(0,184,212,0.25),0_0_20px_rgba(0,184,212,0.1)]"
            }`}
          />
          <button
            type="button"
            role="radio"
            aria-checked={isAudio}
            onClick={() => setSelectedMode("audio")}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              isAudio ? "text-accent-audio" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Audio
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!isAudio}
            onClick={() => setSelectedMode("video")}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              !isAudio ? "text-accent-video" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Video
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="eyebrow block">Format</span>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="select-input"
            >
              {formats.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="eyebrow block">Quality</span>
            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
              className="select-input"
            >
              {qualities.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/60 bg-bg/50 px-4 py-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            isAudio ? "bg-accent-audio-dim text-accent-audio" : "bg-accent-video-dim text-accent-video"
          }`} aria-hidden="true">
            {isAudio ? "A" : "V"}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <p className="text-text-muted">Will save as</p>
            <p className="truncate font-medium text-text-secondary">
              {formatLabel} <span className="text-text-muted">·</span> {qualityLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
