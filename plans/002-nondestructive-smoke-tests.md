# Plan 002 — Non-destructive smoke tests

## Priority: P1 | Effort: ~30 min | Risk: low

## Problem

`test-smoke.mjs` (repo root) ends by calling `DELETE /api/history`, which
**permanently deletes the user's real download history** stored in
`web/data/history.json`. Anyone who runs `npm run test:smoke` against a server
they've been using (the README documents starting the server and running smoke
tests) silently wipes their history.

### Evidence

- `test-smoke.mjs:59-61`:
  ```js
  const clearRes = await fetch(`${base}/api/history`, { method: "DELETE" }).then(r => r.json());
  assert.strictEqual(clearRes.ok, true, "History clear failed");
  ```
- `web/config.mjs:22` hardcodes `historyFile: path.join(__dirname, "data", "history.json")`
  with no environment override.
- CI is unaffected (fresh container, nothing to lose) — this hurts local runs.

## Fix

### Step 1 — Make the data dir configurable

In `web/config.mjs`, allow overriding the data directory via env var, keeping
the current default:

```js
  dataDir: process.env.YTDL_DATA_DIR || path.join(__dirname, "data"),
  historyFile: path.join(
    process.env.YTDL_DATA_DIR || path.join(__dirname, "data"),
    "history.json"
  ),
```

Note `config.mjs` already uses this pattern for `PORT`, `HOST`, and
`ENGINE_MAX_PENDING` — follow it exactly.

### Step 2 — Point smoke tests at an isolated data dir

Do NOT change `test-smoke.mjs`'s expectations — instead document and wire the
override where smoke tests are launched:

1. In the root `package.json`, change:
   ```json
   "test:smoke": "node test-smoke.mjs"
   ```
   to launch a throwaway server+data dir itself? **No** — the smoke script
   assumes a server is already running (CI starts it separately). Keep the
   script as-is.
2. In `.github/workflows/ci.yml`, job `smoke`, in the "Start server" step,
   pass the env var so CI stays hermetic too:
   ```yaml
         - name: Start server
           env:
             YTDL_DATA_DIR: ${{ runner.temp }}/ytdl-smoke-data
           run: |
             cd web
             node server.mjs &
             ...
   ```
   (existing retry loop unchanged).
3. In `README.md`, in the Scripts table row for `npm run test:smoke`, append:
   "Runs against the running server and **clears its history** — set
   `YTDL_DATA_DIR` to a scratch directory to protect real data."

### Step 3 — Guard the destructive call in the smoke script itself

In `test-smoke.mjs`, before the DELETE call (around line 58), refuse to run
against an un-isolated server unless explicitly allowed:

```js
  // 5. History clear (DELETE) — DESTRUCTIVE: wipes the server's history file.
  //    Refuse unless the server was started with an isolated YTDL_DATA_DIR,
  //    or the operator explicitly opted in.
  if (!process.env.YTDL_DATA_DIR && process.env.YTDL_SMOKE_ALLOW_CLEAR !== "1") {
    console.log("ℹ Skipping history-clear test (set YTDL_DATA_DIR on the server, or YTDL_SMOKE_ALLOW_CLEAR=1 to allow wiping real history)");
  } else {
    const clearRes = await fetch(`${base}/api/history`, { method: "DELETE" }).then(r => r.json());
    assert.strictEqual(clearRes.ok, true, "History clear failed");
    console.log("✓ DELETE /api/history OK");
  }
```

This keeps CI green (CI sets `YTDL_DATA_DIR` in step 2) while making local
runs safe by default.

## Verification (done criteria)

1. `cd web && node tests/routes.test.mjs` still passes (it may exercise the
   history service directly — check it doesn't depend on `config.dataDir`
   being non-env-overridable).
2. Full CI-equivalent run locally:
   - `YTDL_DATA_DIR=/tmp/ytdl-smoke node web/server.mjs &`
   - `node test-smoke.mjs` → all checks pass including the history-clear test.
   - Confirm `web/data/history.json` was NOT modified (compare mtime before/after).
3. Run without the env vars against a scratch server: the clear test is
   skipped with the informational message, everything else passes.

## Escape hatches

- If `web/tests/routes.test.mjs` constructs its own `JsonHistoryService` with
  an explicit path (read the file first), no conflict exists — proceed.
- If any other code imports `config.dataDir` (search: `grep -rn "dataDir" web/ --include="*.mjs"`),
  verify the env override doesn't break that consumer; report if it does.

## Maintenance note

Any future persistent state (settings, playlists) should live under
`config.dataDir` so the same isolation knob covers it.
