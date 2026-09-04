# STACK

**Evidence: `package.json`, `web/package.json`, `python-engine/requirements.lock`, `.github/workflows/*`**

## Frontend (`/`)
- **Framework:** React 19 (`react`, `react-dom` ^19.2.x)
- **Language:** TypeScript 5.6 (strict mode, `tsconfig.json` `strict: true`)
- **State:** Zustand 5 (`src/stores/downloadStore.ts`)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`, `postcss.config.js`, CSS-first `@theme` config in `src/styles.css`), custom `src/styles.css`
- **Build/dev:** Vite 6, `@vitejs/plugin-react`
- **Tests:** Vitest 3 + jsdom + `@testing-library/react` + `@testing-library/jest-dom`
- **Lint:** ESLint 10 + `typescript-eslint` + `eslint-plugin-react-hooks`

## Backend (`/web`)
- **Runtime:** Node.js ≥ 18 (Express 5.2 requires 18+; CI pins 20)
- **HTTP:** Express 5.2.1, plain ESM `.mjs` (no TypeScript — deliberate convention)
- **WebSocket:** `ws` 8.18 (server → client one-way broadcasts only)
- **Storage:** JSON file (`web/data/history.json`), atomic temp-file + rename writes
- **Tests:** plain `node:assert` scripts (`web/tests/*.test.mjs`), run by CI

## Engine (`/python-engine`)
- **Language:** Python 3.9+ (CI pins 3.11), `from __future__ import annotations`
- **Key deps (`requirements.lock`, pinned + hash-locked):** `yt-dlp`, `mutagen`, plus FFmpeg (external binary).
  - Optional: **Deno** (JS runtime for yt-dlp extraction), auto-detected at startup
- **Tests:** pytest (`python-engine/tests/`), `pip-audit` in CI

## CI/CD
- **GitHub Actions:** `.github/workflows/ci.yml` (frontend/backend/python/smoke jobs), `.github/workflows/release.yml` (tag `v*` → archive + GitHub Release)
- **Dependabot:** `.github/dependabot.yml` (npm + pip)