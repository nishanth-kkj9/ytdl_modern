# Plan 003 — Frontend URL regex parity with backend

## Priority: P1 | Effort: ~30 min | Risk: low

## Problem

The frontend URL gate in `src/components/UrlInput.tsx` uses a copy of the
server's `YOUTUBE_REGEX` but **drops the `^` start anchor**. Because
`RegExp.prototype.test` searches anywhere in the string, URLs with YouTube
links embedded in a larger hostile string pass the frontend gate, e.g.:

```
https://evil.com/https://youtu.be/dQw4w9WgXcQ
```

The backend (`web/validate.mjs`) has the `^` anchor and correctly rejects
these with a 400, so there is **no security impact** — but the user gets a
queued-looking interaction (frontend enables Probe/Add, `enqueueDownload`
optimistically adds an item) followed by a 400 error, and the code comments
explicitly promise the two copies stay "in sync".

### Evidence

- `src/components/UrlInput.tsx:10` (no `^`):
  ```ts
  const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])(?:[?&#\/].*)?$/i;
  ```
- `web/validate.mjs:7-8` (has `^`):
  ```js
  export const YOUTUBE_REGEX =
    /^(?:https?:\/\/)?(?:www\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])(?:[?&#\/].*)?$/i;
  ```

## Fix

### Step 1 — Add the `^` anchor in the frontend copy

`src/components/UrlInput.tsx:10` becomes:

```ts
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])(?:[?&#\/].*)?$/i;
```

(Also make the inner non-capturing groups non-capturing as shown — the
frontend copy never uses capture groups.)

### Step 2 — Add a parity test so the copies can't drift

Create `src/urlRegex.test.ts` (Vitest picks up `src/**/*.test.ts`
automatically per `vite.config.ts` `test.include`). The test imports the
frontend pattern. The backend pattern is ESM `.mjs` and can be imported
directly (Vite/vitest resolves it; it has no Node-only imports — verify by
reading `web/validate.mjs`, which is pure regex + string logic):

```ts
import { describe, expect, it } from "vitest";
// Frontend copy lives inline in UrlInput.tsx; re-export it to keep this test
// importing the real thing instead of a third copy. (Step 2b below.)
import { YOUTUBE_REGEX as FRONTEND_REGEX } from "./components/urlRegex";
import { YOUTUBE_REGEX as BACKEND_REGEX, isYouTubeUrl } from "../web/validate.mjs";

const ACCEPT = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
  "http://youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "https://www.youtube.com/v/dQw4w9WgXcQ",
  "youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ",
];

const REJECT = [
  "not-a-url",
  "",
  "https://evil.com/https://youtu.be/dQw4w9WgXcQ", // the bug this plan fixes
  "https://vimeo.com/123456789012",
  "https://www.youtube.com/watch?v=shortid12",      // 10 chars
  "https://www.youtube.com/watch?v=waytoolongid123", // 16 chars
  "https://youtu.be/dQw4w9WgXcQextra",               // trailing ID chars
  "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
];

describe("YouTube URL regex parity (frontend vs backend)", () => {
  it("accepts the same URLs", () => {
    for (const url of ACCEPT) {
      expect(FRONTEND_REGEX.test(url), `frontend should accept: ${url}`).toBe(true);
      expect(isYouTubeUrl(url), `backend should accept: ${url}`).toBe(true);
    }
  });
  it("rejects the same URLs", () => {
    for (const url of REJECT) {
      expect(FRONTEND_REGEX.test(url), `frontend should reject: ${url}`).toBe(false);
      expect(isYouTubeUrl(url), `backend should reject: ${url}`).toBe(false);
    }
  });
  it("backend regex is anchored at start", () => {
    expect(BACKEND_REGEX.source.startsWith("^")).toBe(true);
  });
});
```

### Step 2b — Give the frontend copy a home that tests can import

Create `src/components/urlRegex.ts`:

```ts
// UI-only copy of the server-side allowlist in web/validate.mjs
// (YOUTUBE_REGEX). The server is the authoritative enforcement point (it
// rejects non-YouTube URLs with a 400 regardless of what this copy allows).
// src/urlRegex.test.ts pins both patterns to the same fixture set — update
// both together when adding support for new URL shapes.
export const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w\-]{11}(?![\w\-])(?:[?&#\/].*)?$/i;
```

Then in `UrlInput.tsx` delete the local `const YOUTUBE_REGEX = ...` (line 10)
and replace with:

```ts
import { YOUTUBE_REGEX } from "./urlRegex";
```

Keep the explanatory comment block (lines 6–9) by moving it into
`urlRegex.ts` (shown above) — do not duplicate it in both files.

## Verification (done criteria)

1. `npx tsc --noEmit` → exit 0.
2. `npm test` → all existing 23 tests plus the new parity tests pass.
3. Manual sanity: `node -e "const r=require('./web/validate.mjs')"` won't work
   from CJS; instead verify the reject fixture
   `https://evil.com/https://youtu.be/dQw4w9WgXcQ` fails the new frontend
   regex via the test run.

## Escape hatches

- If importing `../web/validate.mjs` from a Vitest test fails (module
  resolution outside `src/`), STOP and report — do not inline a third copy of
  the regex. Alternative that stays honest: move the fixture lists into
  `src/urlRegex.test.ts` and only test the frontend pattern there, adding a
  matching fixture file under `web/tests/` for the backend pattern, both
  generated from the same list. Report which route you took.
- If any ACCEPT/REJECT fixture disagrees between the two regexes after adding
  `^`, treat the **backend** behavior as correct and report the diff.

## Maintenance note

`web/validate.mjs` carries the comment "Keep the two in sync" — update it to
point at `src/urlRegex.test.ts` as the enforcement of that promise.
