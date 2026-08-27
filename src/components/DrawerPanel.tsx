import { useEffect, useRef } from "react";
import { useDownloadStore } from "../stores/downloadStore";
import { SidebarItem } from "./SidebarItem";

interface DrawerPanelProps {
  open: boolean;
  tab: "downloads" | "history";
  onTabChange: (tab: "downloads" | "history") => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function DrawerPanel({ open, tab, onTabChange, onClose, triggerRef }: DrawerPanelProps) {
  const queue = useDownloadStore((s) => s.queue);
  const history = useDownloadStore((s) => s.history);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const clearHistory = useDownloadStore((s) => s.clearHistory);

  const active = queue.filter((i) => i.status === "downloading" || i.status === "queued");
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) triggerRef?.current?.focus();
  }, [open, triggerRef]);

  // Close on Escape + focus trap when open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && asideRef.current) {
        const nodes = asideRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const cancelAll = () => {
    for (const item of active) {
      cancelDownload(item.id);
    }
  };

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} inert={!open}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        ref={asideRef}
        id="queue-history-drawer"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="Queue and history"
        className={`absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-250 ease-out sm:w-[360px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="headline text-text">Queue & History</h2>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-raised hover:text-text-secondary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => onTabChange("downloads")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === "downloads"
                ? "bg-accent-audio-dim text-accent-audio"
                : "text-text-muted hover:bg-raised hover:text-text-secondary"
            }`}
          >
            Downloads{active.length > 0 ? ` (${active.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => onTabChange("history")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === "history"
                ? "bg-accent-audio-dim text-accent-audio"
                : "text-text-muted hover:bg-raised hover:text-text-secondary"
            }`}
          >
            History{history.length > 0 ? ` (${history.length})` : ""}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "downloads" ? (
            active.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-text-muted">No active downloads</p>
            ) : (
              active.map((item) => <SidebarItem key={item.id} item={item} isActive={item.status === "downloading"} />)
            )
          ) : history.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-text-muted">No downloads yet</p>
          ) : (
            history.map((item) => <SidebarItem key={item.id} item={item} />)
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={cancelAll}
            disabled={active.length === 0}
            className="flex-1 rounded-lg bg-accent-audio/10 px-3 py-2 text-xs font-semibold text-accent-audio transition hover:bg-accent-audio/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel all
          </button>
          <button
            type="button"
            onClick={() => clearHistory()}
            disabled={history.length === 0}
            className="flex-1 rounded-lg bg-error/10 px-3 py-2 text-xs font-semibold text-error transition hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear history
          </button>
        </div>
      </aside>
    </div>
  );
}
