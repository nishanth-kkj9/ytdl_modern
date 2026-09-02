import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { DrawerPanel } from "./components/DrawerPanel";
import { UrlInput } from "./components/UrlInput";
import { ProbeCard } from "./components/ProbeCard";
import { EmptyState } from "./components/EmptyState";
import { WaveformProgress } from "./components/WaveformProgress";
import { MetadataPanel } from "./components/MetadataPanel";
import { LogPanel } from "./components/LogPanel";
import { ToastContainer } from "./components/ToastContainer";
import { useEngineEvents } from "./hooks/useEngineEvents";
import { useDownloadStore } from "./stores/downloadStore";

function App() {
  useEngineEvents();
  const loadHistory = useDownloadStore((state) => state.loadHistory);
  const queue = useDownloadStore((state) => state.queue);
  const probeInfo = useDownloadStore((state) => state.probeInfo);
  const selectedMode = useDownloadStore((state) => state.selectedMode);
  const engineStatus = useDownloadStore((state) => state.engineStatus);
  const wsConnected = useDownloadStore((state) => state.wsConnected);

  const totalQueued = queue.length;

  const [drawerTab, setDrawerTab] = useState<"downloads" | "history">("downloads");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setDrawerOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const engineLabel =
    engineStatus === "ready" ? "Engine ready" :
    engineStatus === "starting" ? "Engine starting" : "Engine error";
  const engineDot =
    engineStatus === "ready" ? "bg-success" :
    engineStatus === "starting" ? "bg-warning animate-pulse" : "bg-error";

  return (
    <>
      <Layout
        main={
          <ErrorBoundary>
            <div className="flex h-screen flex-col text-text">
              <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="badge-play" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-base font-semibold tracking-tight text-text">
                      YTDL Modern
                    </h1>
                    <p className="text-xs font-medium tracking-wide text-text-muted">
                      YouTube audio & video downloader
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {!wsConnected && (
                    <span
                      className="tag tag-downloading"
                      role="status"
                      aria-label="Connection to server lost — reconnecting"
                      title="Connection to the server was lost. Live updates paused; retrying automatically."
                    >
                      Reconnecting…
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-text-muted" aria-label={engineLabel}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${engineDot}`} aria-hidden="true" />
                    {engineLabel}
                  </span>
                  {totalQueued > 0 && (
                    <span className="tag tag-downloading">{totalQueued} in queue</span>
                  )}
                  <span className={`tag ${selectedMode === "audio" ? "tag-audio" : "tag-video"}`}>
                    {selectedMode === "audio" ? "Audio" : "Video"}
                  </span>
                  <button
                    type="button"
                    ref={drawerTriggerRef}
                    aria-label="Open queue and history"
                    aria-expanded={drawerOpen}
                    aria-controls="queue-history-drawer"
                    onClick={() => setDrawerOpen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-raised hover:text-text-secondary"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto animate-fade-in">
                <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
                  <UrlInput />
                  <div key={probeInfo?.id ?? "empty"} className="animate-fade-in">
                    {probeInfo ? <ProbeCard info={probeInfo} /> : <EmptyState />}
                  </div>
                  <WaveformProgress />
                  <MetadataPanel />
                  <LogPanel />
                </div>
              </div>
            </div>
          </ErrorBoundary>
        }
      />
      <DrawerPanel
        open={drawerOpen}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
        triggerRef={drawerTriggerRef}
      />
      <ToastContainer />
    </>
  );
}

export default App;
