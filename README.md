# ytdl_modern

Modern YouTube audio/video downloader. React frontend served by a local Node.js backend, with a Python sidecar engine powered by yt-dlp.

## Design

**"The Capture Deck"** — precision-instrument aesthetic inspired by recording studio gear.

- **Sora** display type (headings, buttons, tags)
- **JetBrains Mono** for technical data (logs, file sizes, format codes)
- **Dual accent**: amber for audio, cyan for video
- **Signature element**: pulsing red REC indicator during active downloads
- Waveform animation mirrors download progress; color shifts with audio/video mode
- Dark theme throughout, all colors driven by Tailwind v4 `@theme` tokens

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4 |
| Backend | Node.js (Express, ws) |
| Engine | Python 3 + yt-dlp + mutagen (metadata embedding) |

## Dev

```bash
npm install          # frontend deps
cd web && npm install
cd ..
npm run dev          # Vite dev server (frontend only)

# Run the web server (serves built frontend from dist/)
npm run build        # tsc && vite build
npm run server       # node web/server.mjs → http://127.0.0.1:3000
```

## Architecture

```
Browser ──HTTP/WS──▶ Node.js server (web/server.mjs)
                      ├── serves built React frontend (dist/)
                      ├── REST API: /api/probe, /api/download, /api/cancel, /api/history, /api/status
                      ├── WebSocket: /ws → live engine events
                      └── spawns Python engine (python-engine/ipc_main.py) as child process
```

- `web/server.mjs` — HTTP + WebSocket bootstrap
- `web/config.mjs` — central configuration
- `web/eventBus.mjs` — pub/sub event bus (decouples engine ↔ consumers)
- `web/services/engineManager.mjs` — spawn/manage Python engine, NDJSON bridge, auto-restart
- `web/services/historyService.mjs` — swappable storage (JSON default; swap for SQLite/DB)
- `web/routes/*` — one file per feature (probe, download, history, status)
- `web/middleware/static.mjs` — serve dist/ + downloads/
- `web/validate.mjs` — shared URL validation
- `python-engine/ipc_main.py` — JSON-over-stdin/stdout IPC loop, command dispatch
- `python-engine/engine.py` — Core download engine (yt-dlp + mutagen + format selection)
- `python-engine/helpers.py` — Filename sanitizer, formatters
- `python-engine/logger.py` — File logging

The frontend uses a **transport abstraction** (`src/api/transport.ts`) that maps
Tauri-style `invoke`/`listen` calls to REST + WebSocket. Live engine events
route through the `engine-event` wildcard so the UI reacts to probe results,
download progress, and completion. Adding a new backend command requires only a
new route module in `web/routes/*` and a case in the `invoke` switch.
