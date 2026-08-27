import { useEffect, useRef, useState } from "react";
import { openPath, revealItemInDir } from "../api/transport";
import { useDownloadStore } from "../stores/downloadStore";
import { DownloadItem, HistoryItem } from "../types";
import { isSafeThumbnail } from "../utils";

interface SidebarItemProps {
  item: DownloadItem | HistoryItem;
  isActive?: boolean;
}

export function SidebarItem({ item, isActive }: SidebarItemProps) {
  const addLog = useDownloadStore((s) => s.addLog);
  const retryDownload = useDownloadStore((s) => s.retryDownload);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);

  const isDownloadItem = "status" in item && "progress" in item;
  const downloadItem = isDownloadItem ? (item as DownloadItem) : null;
  const status = downloadItem?.status ?? "completed";
  const progress = downloadItem?.progress;
  const hasFilepath = "filepath" in item && !!item.filepath;

  const [imgError, setImgError] = useState(false);
  const thumbnailUrl = "thumbnail" in item ? item.thumbnail : undefined;

  const statusColor =
    status === "downloading" ? "#F59E0B" :
    status === "completed" ? "#22C55E" :
    status === "failed" ? "#EF4444" :
    status === "cancelled" ? "#8B9CB8" : "#666666";
  const isPulsing = status === "downloading";

  const prevStatusRef = useRef(status);
  const [flashClass, setFlashClass] = useState("");

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "completed" && prev !== "completed") {
      setFlashClass("animate-complete-glow");
      const timer = setTimeout(() => setFlashClass(""), 600);
      return () => clearTimeout(timer);
    }
    if (status === "failed" && prev !== "failed") {
      setFlashClass("animate-fail-shake");
      const timer = setTimeout(() => setFlashClass(""), 400);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const ariaLabel = `${item.title}, ${status}`;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`group flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm transition animate-sidebar-item-in focus-visible:outline-none focus-visible:bg-raised/60 ${
        isActive
          ? "border-accent-audio bg-accent-audio-glow"
          : "border-transparent hover:bg-raised/50 focus-visible:border-accent-video/40"
      } ${flashClass}`}
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-raised ring-1 ring-border/40">
        {thumbnailUrl && isSafeThumbnail(thumbnailUrl) && !imgError ? (
          <img
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text">{item.title}</p>
        {isDownloadItem && progress !== undefined && status === "downloading" && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent-audio transition-all duration-300"
              style={{ width: `${Math.min((progress ?? 0) * 100, 100)}%` }}
            />
          </div>
        )}

        <div className={`mt-1 flex items-center gap-1 transition ${isActive ? "opacity-100" : "opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"}`}>
          {hasFilepath && (
            <>
              <button
                type="button"
                aria-label="Open file"
                onClick={async () => {
                  try { await openPath(item.filepath!); } catch (e) { addLog(`Open error: ${e}`, "error"); }
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-video/60"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 10v-4c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Reveal in folder"
                onClick={async () => {
                  try { await revealItemInDir(item.filepath!); } catch (e) { addLog(`Folder error: ${e}`, "error"); }
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-video/60"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              </button>
            </>
          )}
          {isDownloadItem && status === "failed" && (
            <button
              type="button"
              aria-label="Retry download"
              onClick={() => retryDownload(item.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-raised hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-video/60"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {isDownloadItem && status === "downloading" && (
            <button
              type="button"
              aria-label="Cancel download"
              onClick={() => cancelDownload(item.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-raised hover:text-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error/60"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {isPulsing && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-audio opacity-40" />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </span>
    </div>
  );
}
