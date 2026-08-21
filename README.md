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

## Features

- **Probe** — fetch video metadata (title, uploader, duration, thumbnail, formats) before downloading
- **Audio download** — MP3, Opus, M4A (AAC), WAV with quality presets (maximum/high/medium/low)
- **Video download** — MP4, WebM, MKV with resolution presets (4K/1080p/720p/480p/360p)
- **Metadata embedding** — title, artist, album, date, genre, cover art embedded into files
- **Format verification** — mutagen reads back the file to confirm the codec matches
- **Live progress** — WebSocket-driven progress bars, speed, ETA, and waveform animation
- **Download queue** — multiple concurrent downloads with cancel/retry
- **History** — persistent download history with file open/reveal actions
- **Engine logs** — live event activity panel for debugging

## Architecture

```
Browser ──HTTP/WS──▶ Node.js server (web/server.mjs)
                      ├── serves built React frontend (dist/)
                      ├── REST API: /api/probe, /api/download, /api/cancel, /api/history, /api/status
                      ├── WebSocket: /ws → live engine events
                      └── spawns Python engine (python-engine/ipc_main.py) as child process
```

### Backend Modules (`web/`)

| Module | Purpose |
|--------|---------|
| `server.mjs` | HTTP + WebSocket bootstrap, graceful shutdown, error middleware |
| `config.mjs` | Central configuration (port, paths, engine options) |
| `eventBus.mjs` | Lightweight pub/sub event bus (decouples engine ↔ consumers) |
| `services/engineManager.mjs` | Spawn/manage Python engine, NDJSON bridge, auto-restart, command queueing |
| `services/historyService.mjs` | Swappable storage (JSON default; swap for SQLite/DB) |
| `routes/probe.mjs` | POST /api/probe — validate URL, send probe command |
| `routes/download.mjs` | POST /api/download, POST /api/download/cancel — validate + bridge commands |
| `routes/history.mjs` | GET/POST/DELETE /api/history — history persistence |
| `routes/status.mjs` | GET /api/status — server + engine status |
| `middleware/static.mjs` | Serve dist/ + downloads/ with SPA fallback |
| `validate.mjs` | Shared YouTube URL validation |

### Python Engine (`python-engine/`)

| Module | Purpose |
|--------|---------|
| `ipc_main.py` | JSON-over-stdin/stdout IPC loop, command dispatch, thread management |
| `engine.py` | Core download engine (yt-dlp + mutagen + format selection + retry) |
| `helpers.py` | Filename sanitizer, formatters, platform-aware file opener |
| `logger.py` | Thread-safe file logging with rotation |

### Frontend (`src/`)

| Module | Purpose |
|--------|---------|
| `api/transport.ts` | REST + WebSocket transport abstraction (Tauri-style invoke/listen) |
| `stores/downloadStore.ts` | Zustand store — queue, history, probe, engine status, logs |
| `hooks/useEngineEvents.ts` | WebSocket event handler — routes engine events to store |
| `components/` | UI components (UrlInput, FormatPicker, ProbeCard, WaveformProgress, etc.) |

## Dev

### Prerequisites

- **Node.js** 18+ (for the web server and frontend build)
- **Python** 3.9+ (for the download engine)
- **FFmpeg** (required for audio extraction and video merging)
- **Python deps** (`pip install -r python-engine/requirements.lock`)

### Setup

```bash
# 1. Install frontend deps
npm install

# 2. Install backend deps
cd web && npm install
cd ..

# 3. Install Python deps
pip install -r python-engine/requirements.lock

# 4. Build the frontend (once)
npm run build

# 5. Start the web server
npm run server   # → http://127.0.0.1:3000
```

### Development Mode

```bash
# Terminal 1: Start the backend server
npm run server

# Terminal 2: Start the Vite dev server (frontend with HMR)
npm run dev      # → http://127.0.0.1:5173
```

The Vite dev server proxies `/api`, `/downloads`, and `/ws` to the backend on port 3000.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + build frontend to `dist/` |
| `npm run preview` | Preview the built frontend |
| `npm run server` | Start the Node.js web server |
| `npm run test:smoke` | Run automated smoke tests against a running server |

## API Reference

### `GET /api/health`
Returns `{ "ok": true }`.

### `GET /api/status`
Returns server + engine status:
```json
{
  "server": "ytdl-modern-web",
  "engineReady": true,
  "downloadDir": "d:/my_projects/ytdl_modern/downloads"
}
```

### `POST /api/probe`
Body: `{ "url": "https://youtube.com/watch?v=..." }`
Returns: `{ "id": "uuid" }` — the probe result is delivered over WebSocket.

### `POST /api/download`
Body:
```json
{
  "url": "https://youtube.com/watch?v=...",
  "format": "mp3",
  "quality": "high",
  "mode": "audio",
  "id": "optional-client-id"
}
```
Returns: `{ "id": "..." }` — progress/result events delivered over WebSocket.

### `POST /api/download/cancel`
Body: `{ "id": "..." }`
Returns: `{ "ok": true }`

### `GET /api/history`
Returns: array of download history records.

### `POST /api/history`
Body: `{ "id": "...", "title": "...", ... }`
Returns: `{ "ok": true }`

### `DELETE /api/history`
Clears all history. Returns: `{ "ok": true }`

## WebSocket Events

The server broadcasts engine events to all connected WebSocket clients at `/ws`:

| Event | Payload |
|-------|---------|
| `engine_ready` | `{ ffmpeg, ffprobe, deno }` |
| `engine_log` | `{ message }` |
| `engine_crashed` | `{ exit_code, signal }` |
| `engine_error` | `{ error }` |
| `fatal_error` | `{ error }` |
| `probe_result` | `{ id, success, info }` |
| `download_started` | `{ id, url, fmt, quality }` |
| `progress` | `{ id, status, downloaded, total, speed, filename }` |
| `result` | `{ id, success, title, filepath, ... }` |
| `cancelled` | `{ id }` |
| `error` | `{ id, error_type, error }` |

## Adding a New Backend Command

1. Create a new route module in `web/routes/*.mjs` (or extend an existing one).
2. Register it in `web/server.mjs` with `app.use("/api/...", router)`.
3. Add a case in the `invoke` switch in `src/api/transport.ts`.
4. If the command produces engine events, add the event type to the `eventTypes` array in `web/server.mjs`.

## CI/CD

GitHub Actions workflows are provided in `.github/workflows/`:

- **`ci.yml`** — Runs on every push/PR: installs deps, type-checks, builds, and runs smoke tests.
- **`release.yml`** — Builds and publishes a release when a `v*` tag is pushed.

## License

Private project. All rights reserved.