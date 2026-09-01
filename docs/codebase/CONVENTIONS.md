# CONVENTIONS

**Evidence: `plans/README.md` ("Conventions every executor must follow"), `eslint.config.js`, `tsconfig.json`, representative files.**

## Frontend
- React 19 + TypeScript **strict** mode. Match existing component patterns (`src/components/`).
- Zustand for shared state; colocate action logic in `downloadStore.ts`.
- Tailwind v4 utility classes; custom semantic classes (`card`, `btn`, `tag-*`, `eyebrow`, `stat-card`).
- `aria-*` attributes and keyboard support (drawer + dialog focus traps, Escape handling) are part of the bar.
- Tests: Vitest + `@testing-library/react`, setup in `src/test/setup.ts` (matchMedia / crypto.randomUUID / fetch mocks).

## Backend (`web/*.mjs`)
- **Plain ESM JavaScript, deliberately no TypeScript** (per `plans/README.md`). No new deps unless the plan says so.
- Router factory pattern: `export function xxxRouter(dependency) { const router = Router(); …; return router; }`.
- Error style: `res.status(N).json({ error: "…" })` for validation; `next(err)` for unexpected failures so the
  central handler in `server.mjs` renders them (never leak `err.message` for 5xx).
- Comments explain **why**, not what. Match the existing verbose-comment style.

## Python (`python-engine/`)
- `from __future__ import annotations`; type hints on public signatures.
- Structured events over NDJSON with `error_type` classification (`classify_error_type`).
- File logging via `logger.py` (rotating, `logs/ytdl_pro_YYYYMMDD.log`) — never print to stdout except NDJSON.

## Tests & CI
- Frontend: Vitest; backend: `node:assert` scripts named `*.test.mjs`; Python: pytest.
- CI (`ci.yml`) must keep passing; the backend test list in CI must include any new `web/tests/*.test.mjs`.
- Never commit generated/ignored artifacts (`dist/`, `downloads/`, `logs/`, `web/data`, `graphify-out`, `node_modules`).