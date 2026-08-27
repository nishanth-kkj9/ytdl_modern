import { useEffect, useRef, useState } from "react";
import { useDownloadStore } from "../stores/downloadStore";

export function LogPanel() {
  const [open, setOpen] = useState(true);
  const logs = useDownloadStore((s) => s.logs);
  const engineStatus = useDownloadStore((s) => s.engineStatus);
  const restartEngine = useDownloadStore((s) => s.restartEngine);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [logs, open]);

  return (
    <section className="card">
      <div className="flex w-full items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="engine-log"
          className="flex flex-1 items-center justify-between text-left transition hover:bg-raised/30 -m-2 rounded-lg p-2"
        >
          <div className="text-left">
            <h2 className="eyebrow">
              Engine log{open && <span className="font-normal text-text-muted"> ({logs.length})</span>}
            </h2>
            {open && (
              <p className="mt-0.5 text-xs text-text-muted">Live event activity from the backend</p>
            )}
          </div>
          <svg
            className={`ml-3 h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {engineStatus === "error" && (
            <button
              type="button"
              onClick={() => restartEngine()}
              aria-label="Restart engine"
              title="Engine crashed — click to restart"
              className="btn btn-danger flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restart engine
            </button>
          )}
          {!open && (
            <span className="tabular-nums text-xs text-text-muted">{logs.length} entries</span>
          )}
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-250 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            id="engine-log"
            ref={panelRef}
            className="max-h-56 overflow-y-auto border-t border-border px-5 py-3"
          >
            {logs.length ? (
              <ul className="space-y-2">
                {logs.map((entry, i) => {
                  const color =
                    entry.level === "error"
                      ? "text-error"
                      : entry.level === "warn"
                        ? "text-warning"
                        : "text-text-secondary";
                  return (
                    <li
                      key={entry._seq}
                      className={`font-mono text-[11px] leading-relaxed ${color}`}
                    >
                      <span className="tabular-nums text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                      {" "}{entry.message}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center justify-center py-8 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" aria-hidden="true" />
                  Waiting for activity...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
