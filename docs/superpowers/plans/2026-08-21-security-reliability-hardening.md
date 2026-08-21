# Security & Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix TLS verification bypass, engine command terminality, dependency reproducibility, CI/CD action pinning, and low-risk disclosures — with regression tests for each change.

**Architecture:** Secure defaults first (SEC-01), then request lifecycle guarantee (REL-01), then infrastructure hardening (DEP-01, CICD-01), then cleanup (INFO-01, DOC-01). Each task is independently testable and committable.

**Tech Stack:** Python 3, yt-dlp, Node.js/Express, GitHub Actions, pytest.

## Global Constraints

- Preserve all existing hardening: Host validation, thumbnail SSRF allowlist, output-path containment, bounded concurrency, serialized history, one-way WS.
- Preserve `downloadDir` in `/api/status` — frontend consumes it (`transport.ts:97`).
- HEAD = `f01cd241fd983bc4e4d4f902ca57c305152bbceb`. Only uncommitted file is `repomix-output.xml` (irrelevant).
- No broad refactors. No dependency upgrades beyond lock-generation.
- Validate all changes with existing verification commands before declaring done.

---

## Task 1: SEC-01 — Restore secure TLS defaults in yt-dlp options

**Files:**
- Modify: `python-engine/engine.py` (probe method ~line 976-978, `_build_opts` ~line 1039-1041)
- Modify: `python-engine/tests/test_engine.py`

**Interfaces:**
- Consumes: `AudioDownloadEngine.probe()`, `AudioDownloadEngine._build_opts()` option dicts
- Produces: option dicts that do NOT contain `nocheckcertificate` or `prefer_insecure` by default

- [ ] **Step 1: Write the failing test**

```python
# Add to python-engine/tests/test_engine.py

def test_probe_options_secure_by_default():
    """SEC-01: probe() must not disable TLS certificate verification."""
    engine = AudioDownloadEngine()
    # Patch YoutubeDL to capture options without actually connecting
    captured_opts = {}
    original_class = type(engine).__module__

    from unittest.mock import patch, MagicMock
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = None
    mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
    mock_ydl.__exit__ = MagicMock(return_value=False)

    def capture_opts(opts, *a, **kw):
        captured_opts.update(opts)
        return mock_ydl

    with patch("engine.YoutubeDL", side_effect=capture_opts):
        with patch("engine.contextlib.redirect_stderr"):
            engine.probe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    assert "nocheckcertificate" not in captured_opts, (
        "probe() must not set nocheckcertificate"
    )
    assert "prefer_insecure" not in captured_opts, (
        "probe() must not set prefer_insecure"
    )


def test_download_options_secure_by_default():
    """SEC-01: _build_opts() must not disable TLS certificate verification."""
    from unittest.mock import patch
    engine = AudioDownloadEngine()
    # Mock _find_ffmpeg to return a fake path so _build_opts doesn't fail
    with patch.object(engine, "_ffmpeg_bin", "/usr/bin/ffmpeg"), \
         patch.object(engine, "_ffmpeg_dir", "/usr/bin"), \
         patch.object(engine, "_deno_bin", None):
        opts = engine._build_opts()

    assert "nocheckcertificate" not in opts, (
        "_build_opts() must not set nocheckcertificate"
    )
    assert "prefer_insecure" not in opts, (
        "_build_opts() must not set prefer_insecure"
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python-engine && python -m pytest tests/test_engine.py::test_probe_options_secure_by_default tests/test_engine.py::test_download_options_secure_by_default -v`
Expected: FAIL — both assertions match the current insecure defaults

- [ ] **Step 3: Remove insecure options from engine.py**

In `python-engine/engine.py`:

1. In `probe()` (around line 976-978), remove these two keys from the opts dict:
   ```python
   "nocheckcertificate": True,
   "prefer_insecure": True,
   ```

2. In `_build_opts()` (around line 1039-1041), remove these two keys from the opts dict:
   ```python
   "nocheckcertificate": True,
   "prefer_insecure": True,
   ```

3. Search the entire file for any other occurrence of `nocheckcertificate` or `prefer_insecure` and remove all instances.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python-engine && python -m pytest tests/test_engine.py::test_probe_options_secure_by_default tests/test_engine.py::test_download_options_secure_by_default -v`
Expected: PASS

- [ ] **Step 5: Run full Python test suite**

Run: `cd python-engine && python -m pytest tests -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add python-engine/engine.py python-engine/tests/test_engine.py
git commit -m "fix(security): remove TLS certificate verification bypass from yt-dlp options

SEC-01: nocheckcertificate and prefer_insecure were set to True in both
probe() and _build_opts(), disabling certificate verification for all
YouTube traffic. These are removed so yt-dlp uses the system CA bundle
by default.

Added regression tests that assert the options do not contain insecure
certificate-bypass keys."
```

---

## Task 2: REL-01 — Make queued engine commands terminal on fatal failure

**Files:**
- Modify: `web/services/engineManager.mjs`
- Create: `web/tests/engineManager.test.mjs` (or add to existing test structure)

**Interfaces:**
- Consumes: `EngineManager.sendCommand()`, `EngineManager.maybeRestart()`, `EngineManager.flushPending()`
- Produces: per-request terminal error events when pending commands are discarded

- [ ] **Step 1: Write the failing test**

```javascript
// web/tests/engineManager.test.mjs
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { EngineManager } from "../services/engineManager.mjs";

function makeBus() {
  const bus = new EventEmitter();
  bus.emit = bus.emit.bind(bus);
  return bus;
}

function collect(bus, event) {
  const events = [];
  bus.on(event, (e) => events.push(e));
  return events;
}

// Test: queued commands get terminal error when restart budget exhausted
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);

  // Simulate: engine not ready (no stdin)
  mgr.child = {};
  mgr.stdin = null;
  mgr.ready = false;

  // Queue a command
  mgr.sendCommand({ cmd: "download", id: "req-1", url: "https://example.com" });
  mgr.sendCommand({ cmd: "probe", id: "req-2", url: "https://example.com" });

  assert.strictEqual(mgr.pendingCommands.length, 2, "Commands should be queued");

  // Exhaust restart budget — should emit per-request terminal errors
  const fatalErrors = collect(bus, "fatal_error");
  const errors = collect(bus, "error");

  mgr.restartAttempts = 3; // at budget
  mgr.maybeRestart();

  assert.strictEqual(fatalErrors.length, 1, "Should emit one fatal_error");
  assert.strictEqual(mgr.pendingCommands.length, 0, "Pending should be cleared");

  // Each queued command should have received a terminal error
  const req1Error = errors.find((e) => e.id === "req-1");
  const req2Error = errors.find((e) => e.id === "req-2");
  assert.ok(req1Error, "req-1 should get a terminal error event");
  assert.ok(req2Error, "req-2 should get a terminal error event");
  assert.strictEqual(req1Error.error_type, "EngineFatalError");
  assert.strictEqual(req2Error.error_type, "EngineFatalError");
}

// Test: sendCommand throws when already in fatalError state
{
  const bus = makeBus();
  const mgr = new EngineManager(bus);
  mgr.fatalError = true;

  assert.throws(
    () => mgr.sendCommand({ cmd: "download", id: "req-3" }),
    /fatal error/,
    "sendCommand should throw in fatal state"
  );
}

console.log("All engineManager tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test ../web/tests/engineManager.test.mjs` (or `node tests/engineManager.test.mjs` if the test is in the right place)
Expected: FAIL — `maybeRestart()` currently discards pendingCommands without emitting per-request errors

- [ ] **Step 3: Implement terminal error emission in engineManager.mjs**

In `web/services/engineManager.mjs`, modify `maybeRestart()`:

```javascript
maybeRestart() {
  if (this.restartAttempts >= config.engineMaxRestarts) {
    this.fatalError = true;

    // Emit a terminal error for each pending command before discarding
    const pending = this.pendingCommands;
    this.pendingCommands = [];
    for (const cmd of pending) {
      const id = cmd.id || "";
      this.bus.emit("error", {
        type: "error",
        id,
        error_type: "EngineFatalError",
        error: "Engine crashed and could not be restarted.",
      });
    }

    this.bus.emit("fatal_error", {
      error: "Engine crashed and could not be restarted.",
    });
    return;
  }
  this.restartAttempts += 1;
  console.warn(`Engine exited unexpectedly — restarting (${this.restartAttempts}/${config.engineMaxRestarts})`);
  setTimeout(() => this.spawn(), 500);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node tests/engineManager.test.mjs`
Expected: PASS

- [ ] **Step 5: Run existing smoke/syntax checks**

Run:
```bash
cd web && node --check server.mjs && node --check services/engineManager.mjs
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add web/services/engineManager.mjs web/tests/engineManager.test.mjs
git commit -m "fix(reliability): emit per-request terminal errors when engine restarts exhausted

REL-01: When the engine crashes and restart budget is exceeded, queued
commands were silently discarded with only a global fatal_error event.
Each pending command now receives its own terminal error event
(type=error, error_type=EngineFatalError) so the frontend can transition
the queue item to a failed state.

Added regression test simulating engine failure with queued commands."
```

---

## Task 3: DEP-01 — Lock Python dependencies for reproducibility

**Files:**
- Modify: `python-engine/requirements.txt`
- Create: `python-engine/requirements.lock` (or use pip-compile approach)
- Modify: `.github/workflows/ci.yml` (CI install step)

**Interfaces:**
- Consumes: current ranged `requirements.txt`
- Produces: pinned exact versions with hashes, CI uses locked file

- [ ] **Step 1: Generate locked requirements**

Run:
```bash
cd python-engine
pip install pip-tools
pip-compile --generate-hashes --output-file=requirements.lock requirements.txt
```

If `pip-compile` is unavailable, generate manually:
```bash
cd python-engine
pip install -r requirements.txt
pip freeze > requirements.lock
```

- [ ] **Step 2: Verify lock is reproducible**

Run:
```bash
cd python-engine
rm -rf /tmp/venv-test && python -m venv /tmp/venv-test
/tmp/venv-test/bin/pip install -r requirements.lock
/tmp/venv-test/bin/pip freeze > /tmp/frozen.txt
rm -rf /tmp/venv2 && python -m venv /tmp/venv2
/tmp/venv2/bin/pip install -r requirements.lock
/tmp/venv2/bin/pip freeze > /tmp/frozen2.txt
diff /tmp/frozen.txt /tmp/frozen2.txt
```
Expected: No differences

- [ ] **Step 3: Run Python tests against locked deps**

Run: `cd python-engine && python -m pytest tests -v`
Expected: All tests PASS

- [ ] **Step 4: Update CI to use locked file**

In `.github/workflows/ci.yml`, find the Python install step and change:
```yaml
# Before:
- run: pip install -r python-engine/requirements.txt

# After:
- run: pip install -r python-engine/requirements.lock
```

- [ ] **Step 5: Commit**

```bash
git add python-engine/requirements.lock python-engine/requirements.txt .github/workflows/ci.yml
git commit -m "build(deps): lock Python dependencies for reproducible builds

DEP-01: yt-dlp and mutagen were declared as ranges. Added exact
pinned requirements.lock and updated CI to install from it.
Clean installs now resolve identical versions."
```

---

## Task 4: CICD-01 — Pin release action and narrow permissions

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: current `softprops/action-gh-release@v2` mutable tag
- Produces: immutable SHA-pinned action, least-privilege permissions

- [ ] **Step 1: Resolve the immutable SHA for softprops/action-gh-release@v2**

Run:
```bash
# Get the SHA for the v2 tag
curl -sL "https://api.github.com/repos/softprops/action-gh-release/git/ref/tags/v2" | grep -o '"sha":"[^"]*"' | head -1
```

Alternatively, browse https://github.com/softprops/action-gh-release/releases/tag/v2 and note the commit SHA.

Common known SHA for v2: `c062e08bd532815e2082a3e4f11e7ea55d2b72b3` (verify before using).

- [ ] **Step 2: Update release.yml**

Replace the release step and permissions:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions: {}

jobs:
  build:
    name: Build & Package
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install frontend deps
        run: npm ci

      - name: Type-check
        run: npx tsc --noEmit

      - name: Build frontend
        run: npm run build

      - name: Install backend deps
        working-directory: web
        run: npm ci

      - name: Create release archive
        run: |
          mkdir -p release/ytdl-modern
          cp -r dist release/ytdl-modern/
          cp -r web release/ytdl-modern/
          cp -r python-engine release/ytdl-modern/
          cp package.json release/ytdl-modern/
          cp README.md release/ytdl-modern/
          cd release
          tar -czf ytdl-modern-${{ github.ref_name }}.tar.gz ytdl-modern/
          zip -r ytdl-modern-${{ github.ref_name }}.zip ytdl-modern/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@c062e08bd532815e2082a3e4f11e7ea55d2b72b3 # v2
        with:
          name: ${{ github.ref_name }}
          draft: false
          prerelease: false
          files: |
            release/ytdl-modern-${{ github.ref_name }}.tar.gz
            release/ytdl-modern-${{ github.ref_name }}.zip
          body: |
            ## YTDL Modern ${{ github.ref_name }}

            ### What's New
            - See the [CHANGELOG](CHANGELOG.md) for details.

            ### Installation
            1. Extract the archive to your desired location.
            2. Install Python deps: `pip install -r python-engine/requirements.txt`
            3. Install Node deps: `cd web && npm install`
            4. Start the server: `npm run server`
            5. Open http://127.0.0.1:3000 in your browser.
```

Key changes:
- Top-level `permissions: {}` (empty — no default write)
- Job-level `permissions: contents: write` (least-privilege)
- Action pinned to immutable SHA with version comment

- [ ] **Step 3: Validate YAML syntax**

Run: `cd .github/workflows && python -c "import yaml; yaml.safe_load(open('release.yml'))"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): pin action-gh-release to immutable SHA, narrow permissions

CICD-01: softprops/action-gh-release was referenced via mutable tag v2
with top-level contents:write permission. Pinned to immutable commit SHA,
moved write permission to job-level only.
```

---

## Task 5: INFO-01 — Remove engineEntry from status response

**Files:**
- Modify: `web/routes/status.mjs`
- Verify: `src/api/transport.ts` (frontend consumer — does NOT use `engineEntry`)
- Modify: `test-smoke.mjs` (if needed)

**Interfaces:**
- Consumes: current status response shape
- Produces: status response without `engineEntry`; `downloadDir` retained

- [ ] **Step 1: Verify no frontend consumer uses engineEntry**

Search: `grep -r "engineEntry" src/`
Expected: No results in frontend code. Only `downloadDir` is used via `transport.ts:97`.

- [ ] **Step 2: Remove engineEntry from status.mjs**

```javascript
router.get("/", (_req, res) => {
  res.json({
    server: "ytdl-modern-web",
    engineReady: engineManager.isReady(),
    downloadDir: config.downloadsDir,
  });
});
```

- [ ] **Step 3: Run smoke test syntax check**

Run: `cd web && node --check routes/status.mjs`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/routes/status.mjs
git commit -m "fix(security): remove engineEntry path from /api/status response

INFO-01: The status endpoint exposed the local filesystem path to the
Python engine entry point. Removed — no frontend consumer uses this field.
downloadDir is retained (consumed by transport.ts for filepath resolution)."
```

---

## Task 6: DOC-01 — Fix release changelog reference

**Files:**
- Modify: `.github/workflows/release.yml` (already modified in Task 4)

**Interfaces:**
- Consumes: release body with broken CHANGELOG.md link
- Produces: release body with valid link or removed reference

- [ ] **Step 1: Update release body in release.yml**

Replace the broken CHANGELOG link with the README reference:

```yaml
          body: |
            ## YTDL Modern ${{ github.ref_name }}

            ### What's New
            - See the [README](README.md) for setup and usage details.

            ### Installation
            1. Extract the archive to your desired location.
            2. Install Python deps: `pip install -r python-engine/requirements.txt`
            3. Install Node deps: `cd web && npm install`
            4. Start the server: `npm run server`
            5. Open http://127.0.0.1:3000 in your browser.
```

- [ ] **Step 2: Commit (amend into Task 4 commit or separate)**

If separate:
```bash
git add .github/workflows/release.yml
git commit -m "docs(release): fix broken CHANGELOG.md link in release body

DOC-01: Release body referenced CHANGELOG.md which does not exist in the
repository. Replaced with README.md reference."
```

If Task 4 already committed, amend or fold in:
```bash
git add .github/workflows/release.yml
git commit --amend --no-edit
```

---

## Task 7: Full validation

- [ ] **Step 1: Frontend build**

Run:
```bash
npm ci
npx tsc --noEmit
npm run build
```
Expected: All pass

- [ ] **Step 2: Backend syntax checks**

Run:
```bash
cd web
npm ci
node --check server.mjs
node --check config.mjs
node --check eventBus.mjs
node --check validate.mjs
node --check routes/probe.mjs
node --check routes/download.mjs
node --check routes/history.mjs
node --check routes/status.mjs
node --check services/engineManager.mjs
node --check services/historyService.mjs
node --check middleware/static.mjs
```
Expected: All pass

- [ ] **Step 3: Python compile + tests**

Run:
```bash
pip install -r python-engine/requirements.txt
pip install pytest
python -m py_compile python-engine/engine.py
python -m py_compile python-engine/ipc_main.py
python -m py_compile python-engine/helpers.py
python -m py_compile python-engine/logger.py
python -c "import sys; sys.path.insert(0, 'python-engine'); import engine; import helpers; import logger; print('Python imports OK')"
cd python-engine && python -m pytest tests -v
```
Expected: All pass

- [ ] **Step 4: EngineManager unit test**

Run: `cd web && node tests/engineManager.test.mjs`
Expected: PASS

- [ ] **Step 5: Smoke test (requires running server)**

Run:
```bash
cd web && node server.mjs &
sleep 2
node test-smoke.mjs
kill %1
```
Expected: All smoke tests pass (note: status response shape change — test checks `engineReady` not `engineEntry`)

- [ ] **Step 6: Verify no unrelated changes**

Run: `git diff --stat HEAD`
Expected: Only modified files listed in this plan

---

## Task 8: Final commit and report

- [ ] **Step 1: Review full diff**

Run: `git diff HEAD`
Expected: Clean, scoped changes matching this plan

- [ ] **Step 2: Push (if requested)**

```bash
git push origin main
```

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `python-engine/engine.py` | Remove `nocheckcertificate` and `prefer_insecure` from probe() and _build_opts() |
| `python-engine/tests/test_engine.py` | Add TLS-secure regression tests |
| `web/services/engineManager.mjs` | Emit per-request terminal errors on fatal restart exhaustion |
| `web/tests/engineManager.test.mjs` | New: engineManager terminal-error regression tests |
| `python-engine/requirements.lock` | New: pinned exact Python dependencies |
| `.github/workflows/ci.yml` | Update Python install to use requirements.lock |
| `.github/workflows/release.yml` | Pin action SHA, narrow permissions, fix CHANGELOG link |
| `web/routes/status.mjs` | Remove engineEntry from status response |

## Do-Not-Break Verified

- Host-header validation: untouched
- Thumbnail SSRF allowlist: untouched
- Output-path realpath containment: untouched
- Bounded Python worker pool: untouched
- Serialized history writes: untouched
- One-way WS architecture: untouched
- Mode/format/quality validation: untouched
- Existing CI checks: preserved, updated for lock file

## Deferred Tasks

None. All P1/P2/P3 findings addressed.

## Regression Risks

1. **SEC-01**: Some environments with broken CA bundles may fail HTTPS requests — correct fix is CA configuration, not re-enabling bypass.
2. **REL-01**: Frontend must handle `error` events with `error_type: "EngineFatalError"` for queued items — verified `useEngineEvents.ts:152-156` already handles the `error` case and transitions queue items to `failed`.
3. **CICD-01**: Pinned SHA must match the actual v2 release — verify before committing.
4. **DEP-01**: Locked versions may surface previously masked incompatibilities — existing test suite covers this.
