import { useEffect, useMemo, useRef, useState } from "react";
import { LogEntry, LogLevel, useDownloadStore } from "../stores/downloadStore";

/** All filter chips in display order. */
const LEVELS: LogLevel[] = ["info", "warn", "error"];

/** Formats epoch ms as a HH:MM:SS wall-clock time. */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  info: "text-text-secondary",
  warn: "text-warning",
  error: "text-error",
};

const LEVEL_BADGES: Record<LogLevel, string> = {
  info: "border-border/60 text-text-muted",
  warn: "border-warning/40 text-warning",
  error: "border-error/40 text-error",
};

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <li className={`font-mono text-[11px] leading-relaxed ${LEVEL_STYLES[entry.level]}`}>
      <span className="tabular-nums text-text-muted/70">{formatTime(entry.timestamp)}</span>
      {entry.refId && (
        <span
          className={`ml-2 rounded border px-1 py-px text-[9px] tabular-nums ${LEVEL_BADGES[entry.level]}`}
          title={entry.refId}
        >
          {entry.refId.slice(0, 8)}
        </span>
      )}
      <span className="ml-2">{entry.message}</span>
    </li>
  );
}

export function LogPanel() {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const logs = useDownloadStore((s) => s.logs);
  const engineStatus = useDownloadStore((s) => s.engineStatus);
  const restartEngine = useDownloadStore((s) => s.restartEngine);
  const clearLogs = useDownloadStore((s) => s.clearLogs);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Per-level counts for the filter chips.
  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
    for (const l of logs) c[l.level]++;
    return c;
  }, [logs]);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter]
  );

  // Logs are stored newest-first (prepended), so the newest entry is at the
  // top of the scroll container — scroll to 0, not scrollHeight.
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.scrollTop = 0;
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
          {open && logs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearLogs();
                setFilter("all");
              }}
              aria-label="Clear log"
              title="Clear all log entries"
              className="btn flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
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
          {open && (
            <div className="flex items-center gap-1.5 border-t border-border px-5 pt-3">
              {(["all", ...LEVELS] as const).map((lvl) => {
                const active = filter === lvl;
                const count = lvl === "all" ? logs.length : counts[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setFilter(lvl)}
                    aria-pressed={active}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition ${
                      active
                        ? "border-border bg-raised text-text-primary"
                        : "border-border/40 text-text-muted hover:border-border/70 hover:text-text-secondary"
                    }`}
                  >
                    {lvl}
                    <span className="ml-1 tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div
            id="engine-log"
            ref={panelRef}
            className="max-h-56 overflow-y-auto px-5 py-3"
          >
            {filtered.length ? (
              <ul className="space-y-2">
                {filtered.map((entry) => (
                  <LogLine key={entry._seq} entry={entry} />
                ))}
              </ul>
            ) : (
              <div className="flex items-center justify-center py-8 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" aria-hidden="true" />
                  {logs.length ? "No entries match this filter" : "Waiting for activity..."}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
