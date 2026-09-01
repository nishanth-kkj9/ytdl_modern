# ARCHITECTURE

**Evidence: `web/server.mjs`, `web/services/engineManager.mjs`, `web/eventBus.mjs`,
`python-engine/ipc_main.py`, `src/api/transport.ts`, `src/hooks/useEngineEvents.ts`**

## Layers

```
Browser (React SPA, localhost:5173 dev / :3000 prod)
   │  REST /api/* (JSON, origin-checked, rate-limited)
   ▼
Node.js web server (web/server.mjs, Express 5)
   ├─ routes/*          — request validation → EngineManager.sendCommand()
   ├─ middleware/*      — security (Host allowlist, origin check, rate limit, WS verify)
   ├─ services/engineManager.mjs — spawns + supervises the Python child;
   │     bridges NDJSON (stdin/stdout) to an EventBus
   └─ services/historyService.mjs — atomic JSON history writes
   │
   ▼  NDJSON lines ("cmd": probe|download|cancel|jobs)
Python engine (ipc_main.py) → ThreadPoolExecutor (5 download, 2 probe workers)
   → AudioDownloadEngine (engine.py) → yt-dlp → FFmpeg/mutagen
   → NDJSON stdout events (progress, result, error, cancelled, download_retry…)
   ▼  EventBus → WebSocketServer broadcast(·) → Browser

Browser reconnect: onReconnect() → invoke("get_active_jobs") → GET /api/status
  → activeJobs [id,status] → reconcile orphaned "downloading" items.
```

## Key patterns
- **EventBus decoupling:** producers emit; consumers (WS broadcaster) subscribe.
  Adding a new event = one entry in `server.mjs` `eventTypes` allowlist.
- **Command/job model:** REST is the only mutation path; WebSocket is strictly
  server → client (CSWSH defense).
- **Engine supervision:** bounded auto-restart (`config.engineMaxRestarts = 3`),
  fatal-error state, pending-command backlog cap, `recover()` via `POST /api/engine/restart`.
- **Security posture (defense-in-depth):**
  - Host-header allowlist → 421 (DNS-rebinding guard) — built from `allowedHostsFor()`.
  - Origin check + loopback-only → 403 — built from `allowedOriginsFor()` + `LOOPBACK_ORIGIN_RE`.
  - WS upgrade `verifyClient` rejects foreign origins (same policy).
  - `express.json({limit:"1mb"})`, URL allowlist, output-dir containment (realpath),
    thumbnail SSRF guard (`_is_safe_thumbnail_url`), input length caps, history sanitization.
- **Reconciliation:** `/api/status` returns `activeJobs` snapshot + `pendingCommands`
  backlog depth; `/api/health` returns `{ok, engineReady}`.