# REVIEW 2026-09 (file-by-file audit)

**Scope:** every tracked file at `52771bd` — 92 files across frontend (`src/`), web
server (`web/`), Python engine (`python-engine/`), CI/CD, docs, and scripts.
**Result:** 5 confirmed improvements implemented (REV-01…REV-05), every other
file reviewed and accepted with rationale below.

---

## Root configuration

| File | Verdict | Notes |
|---|---|---|
| `package.json` | ✅ | React 19, Zustand 5, Tailwind v4, Vite 6. Scripts cover test/lint/typecheck/build/dev/smoke. |
| `tsconfig.json` | ✅ | Strict, `noUnusedLocals/Parameters`, ES2022 lib for `Error.cause`. |
| `vite.config.ts` | ✅ | jsdom test env, dev proxy to 3000, watch ignores runtime dirs. |
| `tailwind.config.js` | ✅ | Font aligned to Sora (fixed earlier round). |
| `eslint.config.js` | ✅ | `any` off deliberately for wire payloads. |
| `index.html` | **REV-04** | Added inline SVG favicon (removes wasted `/favicon.ico` SPA-fallback requests). |
| `postcss.config.js` | ✅ | Tailwind v4 + autoprefixer. |
| `.gitignore` | ✅ | Covers artifacts, runtime dirs, venvs, caches. |
| `.env.example` | ✅ | Documents every env var incl. test-only ones. |
| `CONTRIBUTING.md` | ✅ | Setup + commands + conventions. |

## Frontend core (`src/`)

| File | Verdict | Notes |
|---|---|---|
| `main.tsx` | ✅ | StrictMode root, CSS import. |
| `App.tsx` | ✅ | Ctrl+B drawer, WS + engine badges, ErrorBoundary wrap, history preload. |
| `types.ts` | ✅ | Well-typed domain model; toast types added earlier. |
| `utils.ts` | ✅ | SSRF-safe thumbnail allowlist (leading-dot suffix), formatters. |
| `api/transport.ts` | ✅ | WS reconnect w/ exp backoff, JSON error-body parsing, `any` accepted for wire. |
| `stores/downloadStore.ts` | ✅ | Central state: queue/history/probe/logs/toasts; monotonic log seq; 100-cap. |
| `hooks/useEngineEvents.ts` | ✅ | Crash-orphan recovery, reconnect reconciliation, protocol routing, retry surfacing. |
## Frontend components

| File | Verdict | Notes |
|---|---|---|
| `UrlInput.tsx` | **REV-01** | Stale-metadata bug fixed: probe metadata only attached when `probeInfo.url` matches the input URL. |
| `ProbeCard.tsx` | ✅ | Lazy images, format expand/collapse, audio/video detection, adjust-state-during-render reset. |
| `WaveformProgress.tsx` | **REV-02** | Speed stat now uses the EMA-smoothed value (was raw spikes; ETA already used smoothing). |
| `MetadataPanel.tsx` | ✅ | Field priority, verification checklist, description expand. |
| `LogPanel.tsx` | ✅ | Level filters, correlation badges, auto-scroll, restart button on error. |
| `DrawerPanel.tsx` | ✅ | Accessible dialog: focus trap, Escape, return focus, `inert` backdrop. |
| `SidebarItem.tsx` | ✅ | Status animations, open/retry/cancel actions, progress bar. |
| `ToastContainer.tsx` | ✅ | aria-live, per-toast dismiss, level styling. |
| `ConfirmDialog.tsx` | ✅ | Portal, focus trap, danger variant. |
| `EmptyState.tsx` / `ErrorBoundary.tsx` / `Layout.tsx` | ✅ | Clean, minimal, correct. |
| `ModeToggle.tsx` / `FormatQualitySelects.tsx` | ✅ | Radio group semantics; labelled selects. |
| `urlRegex.ts` | ✅ | Mirrors server authority; parity-pinned by `urlRegex.test.ts`. |

## Web server (`web/`)

| File | Verdict | Notes |
|---|---|---|
| `server.mjs` | ✅ | Host allowlist, security headers, per-route rate limits + origin checks, WS heartbeat, graceful shutdown, central error handler, `maxPayload` 1 MB. |
| `config.mjs` | ✅ | `envInt()` never-NaN parsing, single source of loopback allowlists. |
| `eventBus.mjs` | ✅ | Pub/sub with wildcard + error isolation. |
| `validate.mjs` | ✅ | Authoritative URL regex; whitelist history sanitizer with caps. |
| `middleware/security.mjs` | ✅ | Token-bucket limiter w/ pruning, origin + WS verifyClient (CSWSH guard). |
| `middleware/requestLog.mjs` | ✅ | Compact `/api` only, injectable sink. |
| `middleware/static.mjs` | ✅ | `/downloads` hardened (`fallthrough:false`, no dotfiles), express-5 SPA fallback. |
| `routes/probe.mjs` | ✅ | Validate → engine command. |
| `routes/download.mjs` | ✅ | Mode/format/quality enum validation, duration finite-check, metadata caps. |
| `routes/history.mjs` | ✅ | `clampInt` pagination (never NaN), sanitized records, error delegation. |
| `routes/status.mjs` | ✅ | Operational fields; jobs snapshot never 500s. |
| `routes/restart.mjs` | ✅ | Thin recover() wrapper. |
| `services/historyService.mjs` | ✅ | Atomic temp+rename, write serialization, 100-cap, corrupt-file backup. |
| `services/engineManager.mjs` | **REV-05** | Cancel of a still-queued download now drops the pending command + emits `cancelled` instead of start-then-cancel on engine recovery. |
## Python engine (`python-engine/`)

| File | Verdict | Notes |
|---|---|---|
| `engine.py` (1,526 lines) | ✅ | Monolith documented-accepted; retry/backoff, format verify, metadata embed, thumbnail SSRF guard, `js_runtimes` verified correct against pinned yt-dlp. |
| `ipc_main.py` | ✅ | NDJSON handshake + protocol version, lock-protected job registry, `_resolve_output_dir` containment, bounded executors. |
| `helpers.py` | **REV-03** | Removed unused `import os`. |
| `logger.py` | ✅ | Thread-safe rotating logger; `log_app_start` already removed (QUAL-01). |
| `requirements.txt` / `.lock` | ✅ | Ranges + hash-locked pins. |

## CI/CD, scripts, tests, docs

| File | Verdict | Notes |
|---|---|---|
| `.github/workflows/ci.yml` | ✅ | 4 jobs, pinned SHAs, full syntax-check list incl. `restart.mjs`. |
| `.github/workflows/release.yml` | ✅ | Tag-triggered, curated archive (no `node_modules`/`data/`), release assets. |
| `.github/dependabot.yml` | ✅ | Weekly npm ×2 + pip. |
| `scripts/dev-all.mjs` | ✅ | Port pre-flight, output tagging, kill-on-exit. |
| `test-smoke.mjs` | ✅ | Health/status/history/rebind + gated destructive/integration steps. |
| Tests (all suites) | ✅ | 54 frontend · 12 web suites · 29 pytest · smoke — green at head. |
| `README.md`, `docs/codebase/*`, `plans/*`, `web/TODO.md` | ✅ | Accurate with the post-fix behavior. |

---

## Improvements implemented (this review)

| ID | Change | Test |
|---|---|---|
| REV-01 | `UrlInput`: probe metadata only attached when URL matches (`probeInfo.url === url.trim()`) | `coreComponents.test.tsx` — URL A probed, input edited to B, Add → meta `undefined` |
| REV-02 | `WaveformProgress`: Speed stat uses EMA-smoothed value (was raw spike) | `coreComponents.test.tsx` — first frame 100 B/s shows smoothed `30 B/s` |
| REV-03 | `helpers.py`: removed unused `import os` | `py_compile` + full pytest |
| REV-04 | `index.html`: inline SVG favicon (kills `/favicon.ico` round-trip) | build + manual |
| REV-05 | `engineManager.sendCommand`: cancel of a still-queued download removes the pending command and emits `cancelled` (no start-then-cancel flicker after engine recovery) | `engineManager.test.mjs` test 13 |

## Accepted as-is (verified healthy, no change warranted)

- `engine.py` monolith (documented deferral); `has_retried` android_vr retry is live.
- No structured JSON logging / telemetry / Docker / API versioning (localhost deployment model, see CONCERNS.md).
- `npm audit` / `pip-audit` with `|| true` (moderate findings never hard-fail — deliberate).
- Windows drive-letter FFmpeg scan (slow but process-cached, `_find_ffmpeg`).