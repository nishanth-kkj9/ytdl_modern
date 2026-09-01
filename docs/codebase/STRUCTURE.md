# STRUCTURE

**Evidence: repo scan — top-level and key directory listings.**

## Layout

```
ytdl_modern/
├─ src/                     # React frontend (TS)
│  ├─ api/transport.ts      # REST + WebSocket transport (Tauri-style invoke/listen)
│  ├─ components/           # UI components (UrlInput, ProbeCard, WaveformProgress,
│  │                        #   DrawerPanel, SidebarItem, LogPanel, MetadataPanel, …)
│  ├─ hooks/useEngineEvents.ts   # subscribes to WS events → store updates
│  ├─ stores/downloadStore.ts    # Zustand store (queue, history, probe, logs)
│  ├─ types.ts / utils.ts / styles.css
│  └─ *.test.{ts,tsx}       # Vitest tests colocated
├─ web/                     # Node.js backend (plain ESM .mjs)
│  ├─ server.mjs            # entry: Express app + WS broadcast + engine spawn
│  ├─ config.mjs            # centralized config + loopback allowlist helpers
│  ├─ validate.mjs          # URL allowlist + history-record sanitization
│  ├─ eventBus.mjs          # pub/sub bus (producers decoupled from consumers)
│  ├─ routes/               # probe.mjs, download.mjs, history.mjs, status.mjs, restart.mjs
│  ├─ middleware/           # security.mjs (origin/rate-limit/wsVerify), static.mjs
│  ├─ services/             # engineManager.mjs (Python child + NDJSON bridge),
│  │                        #   historyService.mjs (JSON persistence)
│  └─ tests/                # node:assert backend suites
├─ python-engine/           # Python download engine
│  ├─ engine.py             # AudioDownloadEngine (1,508 lines: yt-dlp, metadata,
│  │                        #   verification, thumbnail, retry)
│  ├─ ipc_main.py           # NDJSON stdin/stdout command dispatch (probe/download/cancel/jobs)
│  ├─ helpers.py            # filename sanitization, formatting
│  ├─ logger.py             # rotating file logger → logs/ytdl_pro_*.log
│  └─ tests/                # pytest
├─ scripts/dev-all.mjs      # run Vite + backend together with port pre-flight
├─ dist/                    # Vite build output (gitignored)
├─ downloads/               # downloaded media (gitignored)
├─ logs/                    # engine logs (gitignored)
├─ docs/codebase/           # these docs
└─ plans/                   # improvement-plan records (001–006 + README)
```

## Entry points
- Frontend: `src/main.tsx` → `App.tsx`
- Backend: `web/server.mjs` (`npm run server`, or `npm run dev` inside `web/`)
- Engine: `python-engine/ipc_main.py` (spawned by `EngineManager`)

## Data flow (one download)
`UrlInput → store.enqueueDownload → invoke("start_download") → POST /api/download →
downloadRouter → EngineManager.sendCommand → NDJSON stdin → ipc_main → engine.download
→ progress events → stdout NDJSON → EngineManager → EventBus → WebSocket broadcast →
useEngineEvents → Zustand queue/history updates`