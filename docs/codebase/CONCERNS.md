# CONCERNS

**Evidence: file inventory, `plans/README.md`, `analysis/IMPLEMENTATION_PROMPT.md`, recent commit history.**

## Verified high-confidence findings (fixed in prior rounds)
1. **Auto-retry was invisible to the UI** — the engine silently waited out exponential
   back-off. **FIXED**: `download()` accepts `retry_cb`; `ipc_main` emits `download_retry`;
   WS allowlist + `useEngineEvents` handle it.
2. **Probe failures were mislabeled "Download failed."** (engine sends probe errors as
   `error` events with a non-queue id). **FIXED**: `useEngineEvents` checks queue membership.
3. **History load/clear failed silently** (console only). **FIXED**: surfaces log + status message.
4. **Host/Origin allowlists could drift apart.** **FIXED**: `allowedHostsFor()` /
   `allowedOriginsFor()` in `web/config.mjs` are the single source of truth for both guards.
5. **_/api health/status blind spots, history error leaks, WS CSWSH, Express 5 crash** —
   all resolved (see git log).
6. **Production-readiness round (file-by-file audit)**:
   - **PR-01** Corrupt `history.json` was silently reset (next save overwrote the user's
     history). **FIXED**: `historyService.init()` backs the corrupt file up to
     `history.json.corrupt-<ts>` before any overwrite; ENOENT (first run) stays silent.
   - **PR-02** Garbage `PORT`/`ENGINE_MAX_PENDING` env values produced `NaN` config
     (obscure `listen(NaN)` startup crash). **FIXED**: strict `envInt()` parsing with
     range checks, fallback + loud warning (`web/tests/config.test.mjs`).
   - **PR-03** Cached `readyTools` survived engine death — `/api/status.tools` reported
     stale flags. **FIXED**: cleared in `_onChildExit` (exit handler funnel) and the
     spawn-error handler.
   - **PR-04** Graceful shutdown left connected WS clients alive; `server.close()` relied
     on the 2 s force-exit. **FIXED**: clients terminated before `wss.close()`.
   - **PR-05** Engine sidecar could flash a console window on Windows. **FIXED**:
     `windowsHide: true` on spawn.
   - **PR-06** Non-finite `duration` reached the NDJSON wire as `NaN → null`. **FIXED**:
     dropped unless `Number.isFinite` (routes tests 8b/8c).

## Known gaps (not actioned — reasons documented)
- **`python-engine/engine.py` is a 1,508-line monolith.** Fully tested and working; splitting
  is deferred by design (`plans/README.md`). Revisit when a feature touches it anyway.
- **Engine crash orphaned UI queue items** — FIXED: `engine_crashed` handler in
  `useEngineEvents` now marks in-flight downloads as failed (see `analysis/IMPLEMENTATION_PROMPT.md` §REL-01).
- **Engine readiness was opaque** — FIXED: `engine_ready` now reports `yt_dlp`/`mutagen`
  availability; probe error message is explicit about missing dependencies (see `analysis/IMPLEMENTATION_PROMPT.md` §DX-01).
- **CI workflow trigger never fired** — STALE finding: the analyzed trigger typo
  (`branches: ain, master]`) was already absent at the implementation-start SHA
  (`4c5dbcf` — the trigger block already read `branches: [main, master]`), so no
  trigger edit was required or made; CI-02 pinning + syntax-check coverage was
  applied on top (see `analysis/IMPLEMENTATION_PROMPT.md` §CI-01/§CI-02).
- **Raw JSON error bodies surfaced in the UI** — FIXED: `webFetch` parses JSON error
  bodies and surfaces the inner `error` field (see `analysis/IMPLEMENTATION_PROMPT.md` §UX-01).
- **`/api/download/cancel` shared rate-limit bucket** — FIXED: cancel endpoint has its
  own limiter (21 req/10s) separate from downloads (5 req/10s) (see `analysis/IMPLEMENTATION_PROMPT.md` §REL-02).
- **Structured JSON logging / remote telemetry:** not needed for a localhost single-user app;
  rotating file logger + live WS log panel cover the use case.
- **Docker / Prometheus / API versioning / LAN deployment:** out of scope for the documented
  deployment model (`INTEGRATIONS.md`, `analysis/IMPLEMENTATION_PROMPT.md` §10A).
- **Backend TypeScript / `@ts-check`:** contradicts the documented `.mjs` convention; not wired
  to CI; would need new deps.
- **`npm audit` / `pip-audit` run with `|| true`:** moderate findings never hard-fail CI — deliberate.

## Coverage gaps
- `LogPanel` lacks dedicated Vitest coverage. `UrlInput`, `ProbeCard`, `WaveformProgress`,
  and `MetadataPanel` now have targeted coverage (see `src/components/coreComponents.test.tsx`).
  Store, hook, URL regex, utils, DrawerPanel, and bugfix suites exist.
- Backend has no automated test for the `server.mjs` end-to-end error-middleware wiring beyond
  the live smoke test (static/history routes are covered).

## Round 3 findings (evidence-based sweep at `b0c2ce2`) — FIXED

1. **F-01 History was client-persisted only** — a closed/refreshed tab mid-download
   meant the engine finished the file but no history record was ever written.
   **FIXED**: `web/services/historyPersistence.mjs` subscribes to successful `result`
   events server-side; dedupe converges with client saves by id
   (`web/tests/serverHistory.test.mjs`).
2. **F-02 Page refresh lost in-flight queue items** — `get_active_jobs` was only
   consumed on WS *reconnect*, never at mount. **FIXED**: the engine's jobs snapshot
   now carries `url/fmt/quality/mode`; `restoreActiveJobs()` rebuilds the queue on
   mount (`src/App.tsx`); idempotent against duplicates.
3. **F-03 Late `result` resurrected cancelled items** — cancel during ffmpeg
   post-processing was silently un-done. **FIXED**: the `result` handler mirrors the
   P1-13 progress guard (keeps `cancelled`, logs the outcome, records `filepath`).
4. **F-04 `music.youtube.com` and `/live/` URLs were rejected**. **FIXED**: both
   regex copies (validate.mjs ⇄ urlRegex.ts) accept `music.` subdomain + `/live/`;
   `extractVideoId` covers `/live/`; parity fixtures pinned.
5. **F-05 LogPanel auto-scroll fought the user** (newest-first list yanked to top
   ~4×/s during downloads). **FIXED**: pinned-at-top model (`pinnedRef`, 24px
   threshold); scrolling away unpins, returning re-pins.
6. **F-06 `recover()` silently discarded pending commands** (fatal path emitted
   terminal errors; manual restart didn't). **FIXED**: parity — every discarded
   pending command gets a terminal `error` (`error_type: "EngineRestarted"`).
7. **F-07/F-08 Duplicate-title collisions were silent + stale cache** — same-title
   videos bound the wrong file; re-downloads reported fresh success on skipped
   files; `/downloads` served hour-cached copies. **FIXED (honesty path)**:
   explicit `overwrites: False`, skip detection → `result.warnings`
   ("file already existed — not re-downloaded"); `/downloads` now `maxAge: 0` +
   etag/Last-Modified revalidation.
8. **F-09 Docs/config contradictions** — README license vs MIT; `engines` floor vs
   CI reality. **FIXED**: README says MIT; root `engines: >=18` + `devEngines: >=24`.
9. **F-10 Trim feature was unreachable** — `trim_start`/`trim_end` parsed in the
   engine but never forwarded. **FIXED**: validated end-to-end (Node `parseTimestamp`
   mirror → route 400s → engine constructor).
10. **F-11 Probe spinner lied + unbounded retry** — spinner stopped at REST ack;
    worst case minutes of silence. **FIXED**: store `probeInFlight` bound to the WS
    lifecycle with a 60 s watchdog; engine probe opts tightened (15 s socket,
    retries 3, extractor 2) with a 60 s deadline between outer attempts.
11. **F-12 `verify_format` MKV/WebM passed any parseable container**. **FIXED**:
    requires `matroska` in ffprobe's `format_name`.
12. **F-13 No-FFmpeg video silently degraded to ≤720p**. **FIXED**: warns in the
    engine log AND appends a `warnings` note to the result.
13. **F-14 Cancel failure feedback** — verified the premise was stale (the store
    awaits REST confirmation before flipping), so no revert was needed; added an
    error toast on failed cancels.
14. **F-15 `download_started` before executor pickup** — resolved by IMP-02's
    status-driven restore (`Queued (engine)` / `queued` rows stay honest).
15. **F-16 CSP `connect-src ws:` allowed any WebSocket server**. **FIXED**:
    `ws://127.0.0.1:* ws://localhost:* wss://localhost:*` only.
16. **F-17 `__init__` mutated process-global `os.environ`** (5 constructors racing).
    **FIXED**: PATH prepend dropped; `FFMPEG_PATH` via guarded `setdefault`.
17. **F-18 Route header comment** said `POST /api/cancel`. **FIXED**:
    `POST /api/download/cancel`.

## Round 4 re-audit (at `2229e77`) — 3 wire bugs found & fixed, 1 data-loss gap closed, open items listed

The re-audit targeted Round-3's own diffs with end-to-end verification (the unit
suites passed while real behavior didn't — see N-01/N-02).

1. **N-01 (HIGH) `result.warnings` never reached the NDJSON wire** — `_write_result`
   omitted the field the dataclass carried, so the browser's "Completed — …" note
   and server-side honesty were dead code despite 69 passing tests. **FIXED**:
   payload now carries `warnings`; pinned by `test_write_result_carries_warnings_on_the_wire`
   and live-verified against a real re-download via a WS listener.
2. **N-02 (HIGH) F-07 skip detection could never fire** — with a logger installed,
   yt-dlp routes ALL `to_screen` output (incl. "[download] X has already been
   downloaded") through `logger.debug` (verified against yt-dlp's `to_screen`
   source), which `_YdlLogCollector` dropped wholesale. **FIXED**: the collector
   captures exactly that marker line; debug/info noise stays skipped.
3. **N-03 (HIGH, data loss) duplicate-title collision was NOT actually fixed by
   Round 3** — only the (dead) messaging shipped. Empirically, re-downloading the
   same audio re-downloads the source and re-extracts, overwriting the existing
   file at the same path: a *different* video with the same sanitized title would
   destroy the first video's file. **FIXED**: `_download_once` now resolves the
   output INSIDE its loop; a resolved path older than the download start triggers
   exactly one retry with a `"%(title)s [%(id)s].%(ext)s"` template (never deletes
   or overwrites; idempotent when the id-suffixed file also pre-exists). Pinned by
   `test_duplicate_title_collision_retries_with_id_suffixed_template`.
4. **N-05 (MED) CSP blocked the IPv6 loopback the server accepts** — `allowedHostsFor`
   and the (tested) ws-origin check admit `[::1]`, but the new `connect-src` didn't,
   so browsers on `http://[::1]:3000` silently lost the WS. **FIXED**: added
   `ws://[::1]:* wss://[::1]:*`.

### Still open (assessed, not fixed)
- **N-04 (MED)**: `restoreActiveJobs()` runs once at mount; a page opened while the
  engine is still starting gets `[]` and stays empty (progress events for unknown
  ids are no-ops). Recommendation: re-run restore when `engine_ready` transitions.
- **N-06 (LOW-MED)**: dropping the PATH prepend (F-17) means `verify_format`'s
  `shutil.which("ffprobe")` misses ffprobe in FFMPEG_PATH-only setups → mkv/webm
  verification silently downgrades to extension-trust there.
- **N-07 (LOW)**: the F-03 result guard covers only `cancelled`; a late result can
  still flip `completed`→`failed` or vice versa (no known engine path emits that).
- **N-08 (LOW)**: `trim_start` without `trim_end` passes validation but is silently
  ignored by the engine (it requires both) — could 400 instead.
- **N-09 (LOW)**: client watchdog (60 s) can fire before the engine's probe deadline
  resolves; a late `probe_result` then replaces the timeout error (self-healing).
- **N-10 (LOW)**: no automated test asserts the CSP header value (verified live
  twice); a server-level header test would close that gap.
- **N-11 (cosmetic)**: server-persisted history records lack `thumbnail` (the
  client-saved ones carry it) — drawer rows show no art for those.

## Runtime notes
- Downloads → `downloads/` (gitignored); history → `web/data/history.json` (gitignored,
  100-record cap, atomic temp-file+rename writes); logs rotate at 5 MB × 3 backups.
- DNS-rebinding / CSWSH / SSRF / path-containment guards are covered by tests.
- High-churn files (by git history): `web/server.mjs`, `python-engine/engine.py`,
  `src/hooks/useEngineEvents.ts` — most likely surfaces for future work.