# INTEGRATIONS

**Evidence: repo scan — few external touchpoints; all are intentional and localhost-scoped.**

| Integration | Direction | Notes |
|---|---|---|
| **yt-dlp** (via Python) | Engine → YouTube | Extraction/probe/download. Multiple player clients for bot-detection bypass. Version pinned in `requirements.lock`. |
| **FFmpeg / ffprobe** | Engine → external binary | Post-processing + format verification. Must be on PATH or set via `FFMPEG_PATH`/`FFMPEG_HOME`. Readiness flags surfaced to UI. |
| **mutagen** | Engine → tags | Metadata embedding (M4A/MP4 `covr`, ID3 for MP3, Vorbis for Opus/OGG). |
| **Deno** (optional) | Engine → external binary | JS runtime for yt-dlp extraction; auto-detected, feature-detect only. |
| **YouTube CDN thumbnails** | Engine/UI → `-ytimg.com`, `-googleusercontent.com`, `-googlevideo.com`, `-youtube.com` | SSRF-allowlisted on both server and client. |
| **WebSocket** | Server → browser (one-way) | Loopback-only origin policy; no incoming commands. |
| **GitHub Actions** | CI + Release | Pinned action SHAs; npm/pip audit with `|| true` (non-blocking). |
| **Dependabot** | npm + pip updates | Weekly; PR-based (no auto-merge). |

## Known limitation (intent-dependent → [ASK USER])
- The server is **localhost-only by design** (`config.host = "127.0.0.1"`). There is no
  deployment target, database, auth, or multi-user support. Any LAN/cloud exposure
  requires deliberate allowlist work (`allowedHostsFor`/`allowedOriginsFor`) and is
  **not currently supported**.