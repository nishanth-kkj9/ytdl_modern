# TESTING

**Evidence: `package.json` scripts, `vite.config.ts` (test block), `.github/workflows/ci.yml`, `web/tests/*.test.mjs`, `python-engine/tests/*.py`, `test-smoke.mjs`.**

## Layers & commands

| Layer | Command | Framework | Location |
|---|---|---|---|
| Frontend unit | `npm test` (root) | Vitest 3 + jsdom + Testing Library | `src/**/*.test.{ts,tsx}` |
| Backend unit | `node web/tests/*.test.mjs` (per file, in CI) | `node:assert` + real Express + `http.request` | `web/tests/` |
| Python unit | `cd python-engine && python -m pytest tests -v` | pytest | `python-engine/tests/` |
| Smoke (integration) | `node test-smoke.mjs` (needs running server) | `node:assert` + fetch | repo root |
| Lint / types / build | `npm run lint`, `npx tsc --noEmit`, `npm run build` | ESLint 10 / tsc strict / Vite | — |

## Mocking strategy
- **Frontend** mocks `src/api/transport` via `vi.mock` (`src/stores/downloadStore.test.ts`,
  `src/hooks/useEngineEvents.test.ts`) and captures the WS `engine-event` handler to emit
  synthetic messages. `src/test/setup.ts` stubs `matchMedia`, `crypto.randomUUID`, `fetch`.
- **Backend** uses lightweight inline fakes (e.g. `makeEngine()` with a `sent` array for routes;
  real instances reconstructed against temp files for `historyService`).
- **Python** uses `unittest.mock.patch("yt_dlp.YoutubeDL", …)` / `monkeypatch` on instance methods.

## Smoke test (`test-smoke.mjs`)
- Health, status, history load, probe validation (400), Host-header rebinding guard (421), optional history-clear.
- **History-clear is destructive** → only runs when `YTDL_DATA_DIR` is set (isolation) or `YTDL_SMOKE_ALLOW_CLEAR=1`.
- Optional network test gated by `YTDL_INTEGRATION=1` (probe a real YouTube URL over WS).

## CI wiring (`ci.yml` jobs)
- **frontend:** `npm ci` → `npm test` → `npm run lint` → `tsc --noEmit` → `npm audit` → `npm run build` → upload `dist` artifact.
- **backend:** `npm ci` (web) → `node --check` on every module → per-file unit tests → `npm audit`.
- **python:** install lock + pytest + `pip-audit` + `py_compile` + import check.
- **smoke:** downloads `dist` artifact, starts server with isolated `YTDL_DATA_DIR`, runs `test-smoke.mjs`.

## Coverage snapshot (2026-09-01)
- Vitest **31** tests / 6 files · pytest **24** tests · backend **9** suites · npm/pip audit clean (0 known at HEAD).