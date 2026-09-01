# Plan 005 — Add ESLint (typescript-eslint + react-hooks)

## Priority: P2 | Effort: ~1 hr | Risk: low

## Problem

The repo has strict `tsc` but **no linter at all** — no ESLint config, no
`lint` script in either `package.json`. Classes of bugs `tsc` cannot catch
stay invisible:

- React hook dependency bugs (`react-hooks/exhaustive-deps`) — this repo has
  a real history here: `downloadStore.ts` comments describe StrictMode
  double-subscription bugs, and `useEngineEvents.ts` has a hand-maintained
  dependency array of 7 callbacks that ESLint would verify.
- Unused variables beyond tsc's reach, `@typescript-eslint/no-floating-promises`
  (e.g. the fire-and-forget `invoke("save_history", ...)` in
  `downloadStore.ts:217` — deliberate, but should be *marked* deliberate).

## Fix

### Step 1 — Install (root only; backend is plain `.mjs` and gets the same config)

```bash
npm install -D eslint@^9 typescript-eslint @eslint/js eslint-plugin-react-hooks globals
```

(Versions: ESLint 9 flat config. `typescript-eslint` bundles the parser+plugin.
Do NOT add `eslint-plugin-react` or prettier — out of scope.)

### Step 2 — Create `eslint.config.js` (flat config, repo root)

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "web/node_modules/", "graphify-out/", "scripts/", "repomix-output.xml"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The transport layer deliberately uses `any` for wire payloads.
      "@typescript-eslint/no-explicit-any": "off",
      // Console is the app's logging mechanism in dev.
      "no-console": "off",
    },
  }
);
```

### Step 3 — Scripts

Root `package.json`:

```json
"lint": "eslint src",
"lint:fix": "eslint src --fix"
```

Add a CI step in `.github/workflows/ci.yml` job `frontend`, after `npm ci`:

```yaml
      - name: Lint
        run: npm run lint
```

### Step 4 — Fix or suppress what it finds

Run `npm run lint`. Expected initial findings:

- `@typescript-eslint/no-explicit-any` in `src/api/transport.ts` (handlers
  typed `(payload: any)`) — acceptable; the rule is off.
- Possible `react-hooks/exhaustive-deps` warnings. For each:
  - If a dependency is genuinely missing, fix it (add to the array).
  - If the effect intentionally runs once (e.g. the keydown listener in
    `App.tsx:32-41`), add an inline
    `// eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line
    why-comment, matching the repo's comment style.
- Do not enable new rules beyond the above to keep the initial diff small.

## Verification (done criteria)

1. `npm run lint` → exit 0 (warnings allowed if justified, errors none).
2. `npx tsc --noEmit` → exit 0 (lint config must not break the build).
3. `npm test` → still 23 passing.
4. CI: lint step green on the PR.
5. Negative test: temporarily remove one entry from the dep array in
   `useEngineEvents.ts`, confirm `npm run lint` flags it, then restore.

## Escape hatches

- If `eslint-plugin-react-hooks` v6 flat-config export shape differs
  (`configs.recommended` vs `configs["recommended-latest"]`), adapt to whatever
  the installed version exports and note it.
- If lint findings exceed ~20 auto-fixable issues, stop after fixing
  react-hooks violations and report; don't churn the whole codebase in this PR.

## Maintenance note

Backend `.mjs` files are excluded on purpose (no TS). If desired later, add a
second config block for `web/**/*.mjs` with `js.configs.recommended` only.
