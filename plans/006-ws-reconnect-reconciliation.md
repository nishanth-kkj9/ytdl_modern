# Plan 006 — WebSocket reconnect state reconciliation

## Priority: P3 | Effort: 2–3 hrs | Risk: medium (touches store logic)

## Problem

Download state lives only in browser memory (`downloadStore.queue`) and is
driven by WebSocket events. If the client misses a terminal event — WS drop
while a download finishes, server restart, laptop sleep — the queue item is
**stuck in `status: "downloading"` forever**, with a live progress bar that
never moves and no way to resolve it except a page reload.

The server already sends an `engine_ready` snapshot on every WS connect
(`web/server.mjs:105-133`), but that snapshot contains **no active-download
state**, so the client cannot reconcile.

### Evidence

- `src/api/transport.ts:49-56` — on close, the WS reconnects with backoff;
  nothing re-syncs download state.
- `src/hooks/useEngineEvents.ts` — queue items only transition on events
  (`result`, `error`, `cancelled`); there is no timeout/staleness handling.
- `src/stores/downloadStore.ts` — no code path resets a stale `downloading`
  item.
- `web/server.mjs:105-133` — on-connect snapshot is `engine_ready` only.

## Design (two parts, both required)

### Part A — Backend: expose an active-jobs snapshot

The Node layer does **not** currently know which downloads are active — the
Python engine owns `_DOWNLOAD_JOBS` (`python-engine/ipc_main.py:43`). Two
options; pick **A1** (smaller) first:

**A1 (recommended):** Add a `jobs` query command to the Python engine:
- `python-engine/ipc_main.py`: handle `cmd: "jobs"` → reply
  `{"type": "jobs_result", "request_id": ..., "jobs": [{"id", "status"}...]}`.
  `_DOWNLOAD_JOBS` already holds `id` → `cancel_event`; also track a
  `started` flag set by `_run_download` so status is `queued|running`.
- `web/services/engineManager.mjs`: add `requestJobs()` that sends the
  command and resolves the returned promise on the matching `jobs_result`
  (keep a small pending-request map keyed by `request_id`).
- `web/routes/status.mjs`: extend `GET /api/status` with
  `activeJobs: [...]` from a best-effort `engine.requestJobs()` with a short
  timeout (e.g. 500 ms; return `[]` on timeout/fatal state — status endpoint
  must never fail because the engine is down).

**A2 (fallback if A1 is too invasive):** Purely client-side staleness
detection — mark a `downloading` item as `failed` ("Connection lost — status
unknown") if no progress event for that id arrived for N minutes after
reconnect. Requires no backend change but can false-positive on slow
downloads; only choose this if A1 is blocked.

### Part B — Frontend: reconcile on reconnect

- In `src/api/transport.ts`, expose connection-state awareness: an
  `onReconnect(cb)` hook (called from the existing `ws.onopen` after
  `reconnectAttempts` reset — careful to only fire when it's a *re*connect,
  not the first open).
- In `useEngineEvents.ts`, on reconnect:
  1. `fetch /api/status` via `invoke("get_download_dir")`-style call (add a
     new `invoke` command `"get_active_jobs"` mapping to `GET /api/status`).
  2. For each queue item with `status: "downloading"` whose id is **not** in
     `activeJobs`: mark it `failed` with message
     `"Connection lost — download status unknown. Check history or retry."`
     and add a log entry. Do NOT guess `completed` — the file may exist but
     guessing corrupts history.
  3. Items present in `activeJobs` stay `downloading` and will resume
     receiving events.
- Add unit tests in `src/hooks/useEngineEvents.test.ts` (existing patterns
  there cover event routing with a mocked transport — extend the mock
  transport with reconnect simulation).

## Verification (done criteria)

1. `npx tsc --noEmit` clean; `npm test` all green including new tests.
2. Backend: `cd web && node tests/engineManager.test.mjs` extended with a
   `requestJobs()` resolve-on-reply test (mirror the existing pending-command
   tests).
3. Manual E2E on Windows:
   - Start server + frontend dev; start a long download.
   - Kill the Node server (`taskkill /F /IM node.exe` careful — or Ctrl+C just
     the server), restart it, reload the page mid-download.
   - Expected: the orphaned item shows the "status unknown" failed state
     (A2) or reconciles correctly (A1), and a *new* download still works.
4. `node test-smoke.mjs` still passes (status endpoint shape change must not
   break the `typeof status.engineReady === "boolean"` assertion — keep
   `engineReady` and `downloadDir` top-level).

## Escape hatches

- If `ipc_main.py`'s `_DOWNLOAD_JOBS` cannot be safely exposed (e.g. the
  jobs map also tracks finished-but-unreaped results), report the actual
  structure found in the code before improvising — the map contents may have
  changed since this audit.
- If reconnect detection in `transport.ts` conflicts with the existing
  exponential-backoff logic, wire `onReconnect` from `ws.onopen` with an
  `everConnected` flag instead of a separate event name. Report the choice.

## Maintenance note

`engine_ready` payload shape is load-bearing in three places
(`server.mjs` synthetic snapshot, `useEngineEvents.ts` tool-logging, engine
badge). Any change there must keep the "payload carries type" contract
documented at `web/server.mjs:105-111`.
