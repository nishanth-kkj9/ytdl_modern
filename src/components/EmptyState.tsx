export function EmptyState() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-10 text-center">
      <div className="badge-play mb-5" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-text">Paste a YouTube link to get started</h2>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        Copy any YouTube watch, share, or short link into the field above. Hit <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">Enter</kbd> or <span className="text-text-secondary">Probe</span> to fetch metadata and available formats, then add it to the queue.
      </p>
      <ul className="mt-6 grid gap-2 text-left text-xs text-text-muted sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-audio-dim text-[10px] font-bold text-accent-audio">A</span>
          Audio mode extracts audio only (MP3, Opus, M4A, WAV).
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-video-dim text-[10px] font-bold text-accent-video">V</span>
          Video mode downloads the full video (MP4, WebM, MKV).
        </li>
      </ul>
    </div>
  );
}
