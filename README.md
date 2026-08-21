# YTDL Modern

A local YouTube audio/video downloader with a modern web UI.

Paste a YouTube URL, pick your format, and download — powered by yt-dlp under the hood.

## Features

- **Audio download** — MP3, Opus, M4A, WAV with quality presets
- **Video download** — MP4, WebM, MKV up to 4K
- **Metadata embedding** — title, artist, album, cover art baked into files
- **Format verification** — confirms the output codec matches what you asked for
- **Live progress** — real-time speed, ETA, and waveform animation
- **Download queue** — multiple concurrent downloads with cancel/retry
- **History** — persistent download log with file open/reveal
- **Engine logs** — live event panel for debugging

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4 |
| Backend | Node.js, Express, WebSocket |
| Engine | Python 3, yt-dlp, mutagen, FFmpeg |

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.9+
- **FFmpeg** (on PATH or set `FFMPEG_PATH`)

### Install

```bash
# Frontend
npm install

# Backend
cd web && npm install && cd ..

# Python engine
pip install -r python-engine/requirements.lock
```

### Run

```bash
# Build frontend + start server
npm run build && npm run server
# → http://127.0.0.1:3000
```

For development with hot-reload:

```bash
npm run server    # backend on :3000
npm run dev       # frontend on :5173 (proxies API to :3000)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run server` | Start the Node.js backend |
| `npm run test:smoke` | Smoke tests against a running server |

## API

All endpoints are local-only (`127.0.0.1:3000`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | `{ "ok": true }` |
| `GET` | `/api/status` | Engine readiness + download directory |
| `POST` | `/api/probe` | Fetch video metadata before downloading |
| `POST` | `/api/download` | Start a download |
| `POST` | `/api/download/cancel` | Cancel an active download |
| `GET` | `/api/history` | List download history |
| `POST` | `/api/history` | Save a history record |
| `DELETE` | `/api/history` | Clear all history |

### Probe

```bash
curl -X POST http://127.0.0.1:3000/api/probe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}'
# → { "id": "uuid" }
# Result arrives over WebSocket as probe_result
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
# → { "id": "..." }
# Progress/result events arrive over WebSocket
```

### WebSocket

Connect to `ws://127.0.0.1:3000/ws` for live events:

| Event | Description |
|-------|-------------|
| `engine_ready` | Engine started, lists available tools |
| `probe_result` | Metadata from a probe request |
| `download_started` | Download acknowledged |
| `progress` | Bytes downloaded, speed, status |
| `result` | Download completed or failed |
| `cancelled` | Download cancelled |
| `error` | Per-request error with type |
| `fatal_error` | Engine crashed, cannot recover |

## Architecture

```
Browser ─── HTTP + WebSocket ──▶ Node.js (Express)
                                   │
                                   ▼
                              Python engine (yt-dlp + FFmpeg)
```

The backend validates all input, manages the Python child process, and relays events to the browser over WebSocket. The Python engine handles download orchestration, metadata embedding, and format verification.

## Security

- Localhost-only binding by default
- Host-header validation (DNS rebinding protection)
- YouTube URL allowlist — only youtube.com/youtu.be accepted
- Output directory containment with symlink resolution
- Thumbnail fetch restricted to YouTube CDN domains
- TLS certificate verification enabled by default
- Bounded concurrent downloads (5 workers max)

## CI/CD

GitHub Actions in `.github/workflows/`:

- **`ci.yml`** — Lint, type-check, build, Python tests, smoke tests on every push/PR
- **`release.yml`** — Build + publish release archive on `v*` tags

## License

Private project. All rights reserved.
