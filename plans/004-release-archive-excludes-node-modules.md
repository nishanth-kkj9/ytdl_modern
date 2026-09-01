# Plan 004 — Release archive must exclude `node_modules`

## Priority: P2 | Effort: ~15 min | Risk: none

## Problem

The release workflow archives the **entire `web/` directory**, which includes
`web/node_modules` (Express, ws, and their whole dependency trees — several MB,
platform-irrelevant but stale-prone). The archive also risks including runtime
junk files that happen to sit in `web/` (e.g. `server_out.log`, `server_err.log`,
`web/data/history.json` — the user's download history would be **published in
the release artifact**, a privacy leak).

### Evidence

`.github/workflows/release.yml`, "Create release archive" step:

```yaml
          mkdir -p release/ytdl-modern
          cp -r dist release/ytdl-modern/
          cp -r web release/ytdl-modern/
          cp -r python-engine release/ytdl-modern/
          cp package.json release/ytdl-modern/
          cp README.md release/ytdl-modern/
```

`web/` contains: `node_modules/`, `data/` (history.json — gitignored, i.e.
private), `server_out.log`, `server_err.log`, `test-output.txt`, `TODO.md`.

Note the release *body* already instructs users to run `cd web && npm install`,
so shipping `node_modules` provides zero value.

## Fix

Replace the copy block with an explicit, curated file list:

```yaml
      - name: Create release archive
        run: |
          mkdir -p release/ytdl-modern/web
          cp -r dist release/ytdl-modern/
          # Curated web/ contents — NEVER copy web/node_modules or web/data/
          # (data/ holds the local user's download history; node_modules is
          # reinstalled by users via npm install).
          cp web/server.mjs web/config.mjs web/eventBus.mjs web/validate.mjs \
             web/package.json web/package-lock.json release/ytdl-modern/web/
          cp -r web/routes web/services web/middleware release/ytdl-modern/web/
          cp -r python-engine release/ytdl-modern/
          rm -rf release/ytdl-modern/python-engine/__pycache__ \
                 release/ytdl-modern/python-engine/.pytest_cache
          cp package.json README.md release/ytdl-modern/
          cd release
          tar -czf ytdl-modern-${{ github.ref_name }}.tar.gz ytdl-modern/
          zip -r ytdl-modern-${{ github.ref_name }}.zip ytdl-modern/
```

Notes:
- `python-engine/tests/` can be included (small, useful for packagers) or
  excluded with `--exclude` — include them; they document expected behavior.
- `web/tests/` may be included or omitted; omit for smaller archives by
  simply not copying it (keep the explicit-list approach either way).

## Verification (done criteria)

1. YAML parses; workflow syntax valid (GitHub Actions tab on the PR / tag).
2. Trigger on a test tag (or use `act`/local dry run of just the copy block in
   bash on a scratch copy of the repo) and confirm the archive:
   - contains `web/server.mjs`, `web/routes/`, `web/services/`, `web/middleware/`,
     `web/package.json`
   - does **not** contain `web/node_modules/`, `web/data/`, `*.log`,
     `web/test-output.txt`
3. Compare archive size before/after — should drop by several MB.

## Escape hatches

- If a future module is added under `web/` that isn't in the explicit copy
  list, the release silently omits it (server crash on start for users).
  Mitigation: add a CI release-dry-run check later; for now, leave a comment
  in release.yml at the copy step: "New web/ modules must be added to this
  list." If a new top-level `web/*.mjs` exists at execution time (diff
  against this list: server, config, eventBus, validate), include it and note
  it in the PR.

## Maintenance note

The explicit list trades convenience for safety. If `web/` grows many modules,
consider a `web/.releaseinclude` manifest file that the workflow iterates,
so the list lives next to the code.
