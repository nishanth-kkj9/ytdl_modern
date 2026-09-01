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

## Known gaps (not actioned — reasons documented)
- **`python-engine/engine.py` is a 1,508-line monolith.** Fully tested and working; splitting
  is deferred by design (`plans/README.md`). Revisit when a feature touches it anyway.
- **Structured JSON logging / remote telemetry:** not needed for a localhost single-user app;
  rotating file logger + live WS log panel cover the use case.
- **Docker / Prometheus / API versioning / LAN deployment:** out of scope for the documented
  deployment model (`INTEGRATIONS.md`, `analysis/IMPLEMENTATION_PROMPT.md` §10A).
- **Backend TypeScript / `@ts-check`:** contradicts the documented `.mjs` convention; not wired
  to CI; would need new deps.
- **`npm audit` / `pip-audit` run with `|| true`:** moderate findings never hard-fail CI — deliberate.

## Coverage gaps
- Several frontend components lack dedicated Vitest coverage (UrlInput, ProbeCard,
  WaveformProgress, LogPanel, MetadataPanel). Store, hook, URL regex, utils, DrawerPanel, and
  bugfix suites exist. Flagged P2 in `analysis`.
- Backend has no automated test for the `server.mjs` end-to-end error-middleware wiring beyond
  the live smoke test (static/history routes are covered).

## Runtime notes
- Downloads → `downloads/` (gitignored); history → `web/data/history.json` (gitignored,
  100-record cap, atomic temp-file+rename writes); logs rotate at 5 MB × 3 backups.
- DNS-rebinding / CSWSH / SSRF / path-containment guards are covered by tests.
- High-churn files (by git history): `web/server.mjs`, `python-engine/engine.py`,
  `src/hooks/useEngineEvents.ts` — most likely surfaces for future work.