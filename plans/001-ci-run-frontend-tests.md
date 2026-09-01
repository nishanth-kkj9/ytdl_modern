# Plan 001 — Run the frontend test suite in CI

## Priority: P1 | Effort: ~15 min | Risk: none

## Problem

The repo has 23 frontend tests (Vitest) that all pass locally, but the CI
frontend job never runs them. A regression in `src/**` would pass CI as long
as `tsc` and the Vite build succeed.

### Evidence

`.github/workflows/ci.yml`, job `frontend` (name: "Frontend (TypeScript + Vite)"),
steps in order: checkout → setup-node → `npm ci` → `npx tsc --noEmit` →
`npm audit` → `npm run build` → upload dist artifact. There is **no** `npm test`
step anywhere in the workflow. The `smoke` job runs `test-smoke.mjs` (HTTP
checks only), not the Vitest suite.

## Fix

In `.github/workflows/ci.yml`, inside the `frontend` job, add a test step
**after** `npm ci` and **before** the build step (fail fast before spending
time building):

```yaml
      - name: Test frontend
        run: npm test
```

`npm test` is already defined in the root `package.json` as `vitest run`
(non-watch), so no script changes are needed.

## Verification (done criteria)

1. Locally: `npm test` exits 0 with `Test Files  5 passed (5)`, `Tests  23 passed (23)`.
2. YAML validity: `node -e "require('js-yaml')"` is not available — instead
   validate by pushing a PR and confirming the workflow parses (GitHub reports
   YAML errors on the Actions tab), or run
   `npx --yes yaml-lint .github/workflows/ci.yml` if network access is available.
3. On the PR, the "Frontend (TypeScript + Vite)" job shows a "Test frontend"
   step that passes.

## Escape hatches

- If `npm test` is flaky or slow (>2 min) in CI, keep the step but add
  `timeout-minutes: 5` to the step and report back instead of removing it.
- Vitest needs no browser in this repo (jsdom), so no extra CI services are
  required. If the step fails with a missing-browser error, STOP and report —
  that would mean the config changed since this plan was written.

## Maintenance note

Future test files matching `src/**/*.{test,spec}.{ts,tsx}` (the include glob
in `vite.config.ts`) are picked up automatically. Nothing to update.
