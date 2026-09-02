# Contributing to YTDL Modern

Thanks for your interest! This guide will help you get started quickly.

## Prerequisites

- **Node.js** ≥ 18 (check with `node --version`)
- **Python** ≥ 3.9 (check with `python --version`)
- **FFmpeg** on `PATH` (or set `FFMPEG_PATH` / `FFMPEG_HOME`)
- **Deno** (optional — enables yt-dlp's JS runtime for age-restricted videos)

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/nishanth-kkj9/ytdl_modern.git
cd ytdl_modern

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd web && npm install && cd ..

# 4. Install Python dependencies (recommended: inside a venv)
cd python-engine
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.lock
cd ..

# 5. Copy environment config (optional)
cp .env.example .env
```

## Development

```bash
# Run frontend (Vite dev server) + backend together
node scripts/dev-all.mjs

# Or run them separately:
npm run dev          # Frontend only (Vite on :5173)
cd web && node server.mjs   # Backend only (Express on :3000)
```

Open http://localhost:3000 — Vite proxies `/api` and `/ws` to Express.

## Project Structure

```
ytdl_modern/
├── src/                  # React frontend (Vite + TypeScript + Tailwind)
│   ├── api/              # WebSocket transport, REST wrappers
│   ├── components/       # UI components
│   ├── hooks/            # useEngineEvents (WS event routing)
│   └── stores/           # Zustand state (downloadStore)
├── web/                  # Express backend
│   ├── middleware/       # Security, static, request logging
│   ├── routes/           # REST endpoints (probe, download, history, status)
│   ├── services/         # EngineManager, HistoryService
│   └── tests/            # node:test suites
├── python-engine/        # yt-dlp engine
│   ├── engine.py         # AudioDownloadEngine (download, probe, metadata)
│   ├── ipc_main.py       # NDJSON stdin/stdout IPC dispatcher
│   ├── helpers.py        # Filename sanitization, format utilities
│   └── tests/            # pytest suites
└── scripts/              # Dev orchestration (dev-all.mjs)
```

## Testing

```bash
# Frontend (vitest)
npm test

# Frontend lint + type-check + build
npm run lint
npx tsc --noEmit
npm run build

# Backend (node:test)
cd web && node tests/engineManager.test.mjs
cd web && node tests/historyService.test.mjs
cd web && node tests/historyRoutes.test.mjs
cd web && node tests/routes.test.mjs
cd web && node tests/status.test.mjs
cd web && node tests/validate.test.mjs
cd web && node tests/security.test.mjs
cd web && node tests/static.test.mjs
cd web && node tests/ws-origin.test.mjs
cd web && node tests/cancelRateLimit.test.mjs

# Python (pytest)
cd python-engine && python -m pytest tests -v

# Integration smoke test (requires running server)
node test-smoke.mjs
```

All tests must pass before submitting a pull request.

## Pull Request Guidelines

1. **One logical change per commit** — avoid bundling unrelated fixes.
2. **Write tests** for new behavior or bug fixes. Characterization tests first (red → green) preferred.
3. **Preserve existing behavior** — additive changes only for wire contracts (WS, REST, IPC).
4. **No drive-by refactoring** — if you discover a problem, open an issue rather than fixing it in an unrelated PR.
5. **Document env vars** — add any new ones to `.env.example`.
6. **Keep security posture intact** — Host allowlist, origin checks, rate limits, path containment, and URL allowlists must not be weakened.

## Code Style

- **Frontend:** ESLint (`npm run lint`) + TypeScript strict mode. The `no-explicit-any` rule is intentionally off for wire payloads.
- **Backend:** Plain ESM `.mjs`. 2-space indent. Node's built-in test runner (no framework dependency).
- **Python:** PEP 8. Type hints on public methods. Thread-safe where it matters (engine state, job registry).
- **Tests:** Follow the existing patterns. Frontend tests use Vitest + React Testing Library. Backend tests use `node:test`. Python tests use `pytest`.

## Architecture Decisions

- **No workspace orchestrator** — the three units (frontend, backend, engine) share no monorepo tooling. They communicate over well-defined contracts (REST, WebSocket, NDJSON).
- **Localhost-only by design** — the server binds to loopback with DNS-rebinding protection. LAN exposure is intentionally unsupported.
- **Bounded concurrency** — 5 download workers + 2 probe workers in the engine, capped pending command queue in the backend.

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs. actual behavior
- Engine logs (`python-engine/logs/`) if relevant
- Node and Python versions

## License

By contributing, you agree that your contributions will be licensed under the same terms as the repository.
