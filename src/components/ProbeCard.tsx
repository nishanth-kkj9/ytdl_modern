import { useState } from "react";
import { FormatInfo, ProbeInfo } from "../types";
import { fmtSize, fmtDuration, isSafeThumbnail } from "../utils";

function AudioFormatRow({ f }: { f: FormatInfo }) {
  return (
    <div className="grid grid-cols-[2.5rem_2.5rem_3rem_1fr] items-center gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2 text-xs sm:grid-cols-[3rem_3rem_3.5rem_5rem_3rem_1fr] sm:gap-3">
      <span className="font-mono text-text-muted">{f.format_id}</span>
      <span className="font-medium text-text-secondary">{f.ext}</span>
      <span className="tabular-nums text-accent-audio">{f.abr ? `${f.abr}k` : "—"}</span>
      <span className="tabular-nums text-text-muted">{f.filesize ? fmtSize(f.filesize) : "—"}</span>
      <span className="text-text-muted">{f.audio_sample_rate ? `${Math.round(f.audio_sample_rate / 1000)}kHz` : "—"}</span>
      <span className="truncate text-text-muted">{f.acodec ?? "—"}</span>
    </div>
  );
}

function VideoFormatRow({ f }: { f: FormatInfo }) {
  return (
    <div className="grid grid-cols-[2.5rem_2.5rem_4rem_1fr] items-center gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2 text-xs sm:grid-cols-[3rem_3rem_5rem_3rem_1fr_4rem] sm:gap-3">
      <span className="font-mono text-text-muted">{f.format_id}</span>
      <span className="font-medium text-text-secondary">{f.ext}</span>
      <span className="text-accent-video">{f.resolution ?? "—"}</span>
      <span className="text-text-muted">{f.fps ? `${f.fps}fps` : "—"}</span>
      <span className="truncate text-text-muted">{f.vcodec ?? "—"}</span>
      <span className="tabular-nums text-right text-text-muted">{f.filesize ? fmtSize(f.filesize) : "—"}</span>
    </div>
  );
}

interface ProbeCardProps {
  info: ProbeInfo | null;
}

export function ProbeCard({ info }: ProbeCardProps) {
  const [showFormats, setShowFormats] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Reset image state when a different video is probed. Uses React's
  // "adjust state during render" pattern instead of an effect — an effect
  // here fired a cascading extra render on every probe change
  // (react-hooks/set-state-in-effect).
  const [prevId, setPrevId] = useState<string | undefined>(info?.id);
  if (prevId !== info?.id) {
    setPrevId(info?.id);
    setImgLoaded(false);
    setImgError(false);
  }

  if (!info) return null;

  // A video is detected if ANY format has a video codec.
  const isAudio = !(info.formats?.some((f) => f.vcodec && f.vcodec !== "none") ?? false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/50">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="relative w-full shrink-0 sm:w-[280px]">
          <div
            className="rounded-xl bg-raised"
            style={{ aspectRatio: "16 / 9" }}
            aria-hidden="true"
          />
          {info.thumbnail && isSafeThumbnail(info.thumbnail) && !imgError && (
            <img
              src={info.thumbnail}
              alt={info.title}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full rounded-xl object-cover img-outline shadow-lg transition-opacity duration-200 ease-out"
              style={{ aspectRatio: "16 / 9", opacity: imgLoaded ? 1 : 0 }}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="eyebrow">Probe result</p>
          <h3 className="text-lg font-semibold leading-snug text-text text-balance">
            {info.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {info.uploader}
            </span>
            {info.duration != null && (
              <span className="flex items-center gap-1.5 tabular-nums">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {fmtDuration(info.duration)}
              </span>
            )}
            <span className={`tag ${isAudio ? "tag-audio" : "tag-video"}`}>
              {isAudio ? "Audio" : "Video"}
            </span>
          </div>
          {info.description && (
            <p className="line-clamp-2 text-xs text-text-muted">{info.description}</p>
          )}
        </div>
      </div>

      {info.formats && info.formats.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={showFormats}
            aria-controls="probe-formats-list"
            onClick={() => setShowFormats(!showFormats)}
            className="flex w-full items-center justify-between px-5 py-2.5 text-xs text-text-muted transition hover:bg-raised/50 hover:text-text-secondary"
          >
            <span>{info.formats.length} formats available</span>
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showFormats ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showFormats && (
            <div
              id="probe-formats-list"
              className="flex max-h-48 flex-col gap-1.5 overflow-y-auto border-t border-border px-5 py-3"
            >
              {info.formats.map((f, i) => (
                f.vcodec === "none" || !f.vcodec
                  ? <AudioFormatRow key={`${f.format_id}-${i}`} f={f} />
                  : <VideoFormatRow key={`${f.format_id}-${i}`} f={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
