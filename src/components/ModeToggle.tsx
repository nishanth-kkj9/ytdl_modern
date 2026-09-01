import type { ContentMode } from "../types";

interface ModeToggleProps {
  selectedMode: ContentMode;
  onModeChange: (mode: ContentMode) => void;
}

export function ModeToggle({ selectedMode, onModeChange }: ModeToggleProps) {
  const isAudio = selectedMode === "audio";

  return (
    <>
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
          onClick={() => onModeChange("audio")}
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
          onClick={() => onModeChange("video")}
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
    </>
  );
}
