# YTDL Modern

Local YouTube audio/video downloader with a web UI. Built with React, Node.js, and yt-dlp.

Paste a YouTube link, probe for metadata, pick your format, and download.

## Features

- **Probe** — fetch title, uploader, duration, thumbnail, and available formats before downloading
- **Audio** — MP3, Opus, M4A/AAC, WAV with quality presets (maximum / high / medium / low)
- **Video** — MP4, WebM, MKV with resolution presets (4K, 1080p, 720p, 480p, 360p)
- **Metadata** — embeds title, artist, album, date, genre, description, and cover art into files
- **Format verification** — post-download readback confirms the output codec matches what you requested
- **Cover art** — fetches the highest-resolution YouTube thumbnail and embeds it automatically
- **Download queue** — multiple concurrent downloads (up to 5 workers) with cancel and retry
- **Live progress** — real-time speed, ETA, and animated waveform bars
- **History** — persistent download log (capped at 100 records) with file open/reveal
- **Bot-detection bypass** — uses multiple YouTube player clients (iOS, Android, web) for reliable extraction
- **Engine logs** — live event panel for debugging

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4, Vite |
| Backend | Node.js, Express, WebSocket |
| Engine | Python 3, yt-dlp, mutagen, FFmpeg |
| Optional | Deno (JS runtime for yt-dlp extraction) |

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.9+
- **FFmpeg** — must be on PATH, or set `FFMPEG_PATH` / `FFMPEG_HOME` env var

### Install

Use a virtual environment for the Python engine — it keeps the pinned,
hash-locked dependencies (see `requirements.lock`) out of your global Python
and avoids PATH conflicts with yt-dlp/FFmpeg:

```bash
# Frontend
npm install

# Backend
cd web && npm install && cd ..

# Python engine (pinned versions with hashes) — in a venv
python -m venv venv
# Windows:  venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r python-engine/requirements.lock
```

Or install from unpinned ranges:

```bash
pip install -r python-engine/requirements.txt
```

### Run

```bash
# Build frontend + start server
npm run build && npm run server
# -> http://127.0.0.1:3000
```

### Development

```bash
# Terminal 1 — backend (auto-restart via --watch)
cd web && npm run dev

# Terminal 2 — frontend with HMR
npm run dev
# -> http://127.0.0.1:5173
```

The Vite dev server proxies `/api`, `/downloads`, and `/ws` to the backend on port 3000.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run server` | Start the Node.js backend on `:3000` |
| `npm run test:smoke` | Run smoke tests against a running server. Note: the history-clear step **wipes the server's history** — it is skipped unless the server was started with `YTDL_DATA_DIR` pointing at a scratch dir, or you set `YTDL_SMOKE_ALLOW_CLEAR=1`. |

Inside `web/`:

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with file watching (auto-restart) |

## API

All endpoints are local-only (`127.0.0.1:3000`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Returns `{ "ok": true, "engineReady": <bool> }` — server liveness + engine readiness |
| `GET` | `/api/status` | Engine readiness, tool availability, active jobs, pending-command backlog, version, uptime |
| `POST` | `/api/probe` | Fetch video metadata (result via WebSocket) |
| `POST` | `/api/download` | Start a download |
| `POST` | `/api/download/cancel` | Cancel an active download |
| `GET` | `/api/history` | List download history — optional `?limit=` (max 200, default 100) + `?offset=` for paging |
| `POST` | `/api/history` | Save a history record |
| `DELETE` | `/api/history` | Clear all history |

### Probe

```bash
curl -X POST http://127.0.0.1:3000/api/probe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}'
# -> { "id": "uuid" }
# Actual result arrives over WebSocket as probe_result
```

### Download

```bash
curl -X POST http://127.0.0.1:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "mp3",
    "quality": "high",
    "mode": "audio"
  }'
# -> { "id": "..." }
# Progress and result events arrive over WebSocket
```

**Parameters:**

| Field | Default | Options |
|-------|---------|---------|
| `url` | *required* | YouTube URL |
| `mode` | `"audio"` | `"audio"`, `"video"` |
| `format` | `"mp3"` | Audio: `mp3`, `opus`, `m4a`, `aac`, `wav` — Video: `mp4`, `webm`, `mkv` |
| `quality` | `"high"` | Audio: `maximum`, `high`, `medium`, `low` — Video: `maximum`, `best`, `2160p`, `1080p`, `720p`, `480p`, `360p`, `high`, `medium`, `low` |
| `id` | auto-generated | Client-side ID for tracking |

Optional metadata fields: `title`, `uploader`, `thumbnail`, `duration`, `webpage_url`.

### WebSocket

Connect to `ws://127.0.0.1:3000/ws` for live events (server-to-client only):

| Event | Payload | Description |
|-------|---------|-------------|
| `engine_ready` | `{ protocol_version, ffmpeg, ffprobe, deno, yt_dlp, mutagen }` | Engine started; advertises its NDJSON protocol version and available tools |
| `probe_result` | `{ id, success, info }` | Metadata from a probe request |
| `download_started` | `{ id, url, fmt, quality }` | Download acknowledged by engine |
| `progress` | `{ id, status, downloaded, total, speed }` | Download progress |
| `result` | `{ id, success, title, filepath, ... }` | Download completed or failed |
| `cancelled` | `{ id }` | Download cancelled |
| `error` | `{ id, error_type, error }` | Per-request error |
| `fatal_error` | `{ error }` | Engine crashed, cannot recover |
| `engine_crashed` | `{ exit_code, signal }` | Python process exited unexpectedly |
| `engine_log` | `{ message }` | Raw engine output |

## Architecture

```
Browser --- HTTP + WebSocket ---> Node.js (Express, port 3000)
                                    |
                                    |-- URL validation
                                    |-- REST routes (probe, download, history, status)
                                    |-- WebSocket event broadcast
                                    +-- EngineManager
                                          | NDJSON stdin/stdout
                                          v
                                    Python IPC (ipc_main.py)
                                          |
                                          +-- ThreadPoolExecutor (5 workers)
                                          +-- AudioDownloadEngine (engine.py)
                                                |-- yt-dlp for extraction
                                                |-- mutagen for metadata
                                                +-- FFmpeg for audio/video processing
```

## Security

| Control | Detail |
|---------|--------|
| Localhost binding | Binds to `127.0.0.1` by default — not accessible from the network |
| Host header validation | Rejects requests with invalid `Host` header (DNS rebinding protection) |
| YouTube URL allowlist | Only `youtube.com` and `youtu.be` URLs are accepted |
| Output directory containment | Resolves symlinks and verifies the output path stays within `downloads/` |
| SSRF protection | Thumbnail and download URLs are restricted to YouTube CDN domains |
| TLS verification | Certificate verification is never disabled |
| Bounded concurrency | Max 5 simultaneous downloads |
| Input length limits | Title capped at 500 chars, uploader at 256, thumbnail URL at 500 |
| JSON body limit | Express request body capped at 1 MB |
| No command injection | WebSocket is one-way (server to client) — no incoming commands accepted |
| Windows reserved names | Filenames containing CON, PRN, AUX, NUL, COM1-9, LPT1-9 are sanitized |

## CI/CD

GitHub Actions in `.github/workflows/`:

### `ci.yml` (runs on push/PR to main)

1. **Frontend** — install, type-check (`tsc --noEmit`), Vite production build
2. **Backend** — install, syntax check all `.mjs` files with `node --check`
3. **Python** — install from lock file, compile check, import check, pytest
4. **Smoke** — starts the server, runs `test-smoke.mjs` (health, status, history, probe validation, DNS rebinding test)

### `release.yml` (runs on `v*` tags)

Builds frontend, creates release archive (tar.gz + zip), publishes a GitHub Release.

## Project Structure

```
ytdl_modern/
  src/                    # React frontend
    components/           # UI components
    api/transport.ts      # REST + WebSocket transport
    stores/               # Zustand state management
    hooks/                # WebSocket event handler
  web/                    # Node.js backend
    routes/               # Express route handlers
    services/             # Engine manager, history persistence
    config.mjs            # Server configuration
    server.mjs            # HTTP + WebSocket bootstrap
  python-engine/          # Python download engine
    engine.py             # yt-dlp + mutagen core
    ipc_main.py           # NDJSON IPC + command dispatch
    helpers.py            # Filename sanitizer, formatters
    logger.py             # File logging with rotation
    tests/                # Engine unit tests
  dist/                   # Built frontend output
  downloads/              # Downloaded media files
  logs/                   # Python engine logs
```

## Troubleshooting

- **FFmpeg not found / format verification fails** — install FFmpeg and make
  sure `ffmpeg` is on `PATH`, or point the engine at it via the `FFMPEG_PATH` /
  `FFMPEG_HOME` env vars. The live log panel shows `ffmpeg=no` when the engine
  cannot find it.
- **Engine crashes immediately on start** — check `logs/ytdl_pro_*.log` (Python
  file logger with rotation) and `web` server output. The web UI also shows a
  "Restart engine" control that calls `POST /api/engine/restart`.
- **Python dependency errors** — install into a fresh venv from
  `requirements.lock` (pinned + hash-locked). If you mix in global packages,
  conflicting `yt-dlp` versions frequently break extraction.
- **Port 3000 already in use** — set `PORT` (e.g. `$env:PORT=3100`) before
  starting; Vite's dev proxy forwards `/api`, `/downloads`, `/ws` to whatever
  port `web/config.mjs` resolves.
- **Serving a stale UI** — `npm run build` outputs to `dist/`; the backend only
  serves the latest build after a rebuild + restart.

## License

Private project. All rights reserved.
