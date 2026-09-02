import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useDownloadStore } from "../stores/downloadStore";
import type { DownloadItem } from "../types";
import { fmtSize } from "../utils";

function eta(downloaded: number, total: number, speed: number): string | null {
  if (speed <= 0 || downloaded >= total) return null;
  const r = (total - downloaded) / speed;
  if (r < 60) return `${Math.round(r)}s`;
  if (r < 3600) return `${Math.floor(r / 60)}m ${Math.round(r % 60)}s`;
  return `${Math.floor(r / 3600)}h ${Math.floor((r % 3600) / 60)}m`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function WaveformBars({ isAudio }: { isAudio: boolean }) {
  const bars = Array.from({ length: 24 }, (_, i) => i);
  const staggerDelay = 0.05;
  return (
    <div className={`waveform-bars ${isAudio ? "waveform-bars-audio" : "waveform-bars-video"}`} aria-hidden="true">
      {bars.map((i) => (
        <div
          key={i}
          className="bar"
          style={{ animationDelay: `${i * staggerDelay}s` }}
        />
      ))}
    </div>
  );
}

function ActiveDownloadCard({ item }: { item: DownloadItem }) {
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const selectedMode = useDownloadStore((s) => s.selectedMode);
  const isAudio = item.type === "audio" || (item.type === undefined && selectedMode === "audio");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - t0), 1000);
    return () => clearInterval(iv);
  }, [item.id]);

  const hasProgress = item.total > 0;
  const pct = hasProgress ? Math.round(item.progress * 100) : 0;

  // Exponential moving average for speed smoothing — yt-dlp reports
  // instantaneous speed which can spike 0→max→0 between updates. EMA
  // (α=0.3) yields a stable, responsive readout without a sample buffer.
  const smoothedSpeedRef = useRef(0);
  if (item.speed > 0) {
    const alpha = 0.3;
    smoothedSpeedRef.current = alpha * item.speed + (1 - alpha) * smoothedSpeedRef.current;
  } else {
    smoothedSpeedRef.current = 0;
  }
  const smoothedSpeed = smoothedSpeedRef.current;
  const etaStr = eta(item.downloaded, item.total, smoothedSpeed);

  return (
    <section
      className="card overflow-hidden animate-fade-in-up"
      aria-label={`Downloading ${item.title || item.url}`}
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="recording-dot" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">
                {item.title || item.url}
              </p>
              <p className="text-[11px] tabular-nums text-text-muted">
                {elapsed > 0 && `${formatElapsed(elapsed)} elapsed`}
                {elapsed > 0 && etaStr && ` · ${etaStr} remaining`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`tag tabular-nums ${isAudio ? "tag-audio" : "tag-downloading"}`}>
              {hasProgress ? `${pct}%` : "..."}
            </span>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="btn btn-danger px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className={`mt-3 progress-bar ${hasProgress ? "" : "progress-indeterminate"}`}>
          {hasProgress && (
            <div
              className={`progress-bar-fill ${isAudio ? "progress-bar-fill-audio" : ""}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="stat-card">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Speed</p>
            <p className={`mt-0.5 tabular-nums text-sm font-semibold ${isAudio ? "text-accent-audio" : "text-accent-video"}`}>
              {item.speed > 0 ? `${fmtSize(item.speed)}/s` : <span className="shimmer-text">waiting</span>}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Downloaded</p>
            <p className="mt-0.5 tabular-nums text-sm font-semibold text-text">
              {item.downloaded > 0 ? fmtSize(item.downloaded) : <span className="shimmer-text">—</span>}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Total</p>
            <p className="mt-0.5 tabular-nums text-sm font-semibold text-text">
              {hasProgress ? fmtSize(item.total) : <span className="shimmer-text">—</span>}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">ETA</p>
            <p className="mt-0.5 tabular-nums text-sm font-semibold text-success">
              {etaStr ?? <span className="shimmer-text">—</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[68px] border-t border-border">
        <WaveformBars isAudio={isAudio} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel download?"
        message={`Are you sure you want to cancel "${item.title || item.url}"?`}
        confirmLabel="Cancel Download"
        cancelLabel="Keep Going"
        danger
        onConfirm={() => {
          cancelDownload(item.id);
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

export function WaveformProgress() {
  const queue = useDownloadStore((s) => s.queue);
  const active = useMemo(
    () => queue.filter((i) => i.status === "downloading"),
    [queue],
  );

  if (active.length === 0) return null;

  return (
    <>
      {active.map((item) => (
        <ActiveDownloadCard key={item.id} item={item} />
      ))}
    </>
  );
}
