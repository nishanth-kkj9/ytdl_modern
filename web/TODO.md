# YTDL Modern — Web Conversion Plan (Modular / Feature-proof)

## Goal
Run the app as a modular local-hosted website (there is no Tauri/desktop build
in this repository). Keep a clean abstraction layer so adding new features is
easy.

## Architecture
```
Browser ──HTTP/WS──▶ Node.js server (web/server.mjs)
                      ├── serves built React frontend (dist/)
                      ├── REST API: /api/probe, /api/download, /api/download/cancel, /api/history, /api/status
                      ├── WebSocket: /ws → live engine events
                      └── spawns Python engine (python-engine/ipc_main.py) as child process
```

## Backend Modules (web/)
- [x] web/config.mjs — central config (port, paths, engine options)
- [x] web/eventBus.mjs — pub/sub bus (decouples engine events from WS)
- [x] web/services/historyService.mjs — swappable storage (JSON default)
- [x] web/services/engineManager.mjs — spawn/manage Python engine, NDJSON bridge
- [x] web/routes/probe.mjs — POST /api/probe
- [x] web/routes/download.mjs — POST /api/download, POST /api/download/cancel
- [x] web/routes/history.mjs — GET/POST /api/history
- [x] web/routes/status.mjs — GET /api/status
- [x] web/middleware/static.mjs — static file serving
- [x] web/server.mjs — entry: HTTP + WS bootstrap
- [x] web/package.json — deps (express, ws)

## Frontend (modular transport abstraction)
- [x] src/api/transport.ts — env-aware client (Tauri or Web REST+WS)
- [x] src/stores/downloadStore.ts — use transport abstraction
- [x] src/hooks/useEngineEvents.ts — use transport events
- [x] src/components/SidebarItem.tsx — remove Tauri opener dependency via transport

## Build & Run
- [x] Verify backend runs and serves frontend
  - [x] `tsc --noEmit` passes cleanly (EXIT:0)
  - [x] `vite build` succeeds (EXIT:0)
  - [x] Server starts, health = `{"ok":true}`
  - [x] Status = `engineReady:true`
  - [x] Root serves built React frontend (200)
  - [x] History API returns `[]`

## Run It
```bash
# 1. Build the frontend (once)
cd d:/my_projects/ytdl_modern
npm run build        # or: npx vite build

# 2. Start the web server
cd web
npm install          # first time only
node server.mjs      # → http://127.0.0.1:3000
