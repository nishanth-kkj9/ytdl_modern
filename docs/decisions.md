# YTDL Flow — Decision Log

ADR-style log. Entries are numbered chronologically and cite their evidence in
the repository (code, `docs/codebase/*`, plans, or CI). No speculative or
unverifiable entries.

---

## ADR-001 — Three-tier architecture: React SPA → Node/Express → Python engine

### Context
The project must drive `yt-dlp`/FFmpeg (Python/CLI ecosystem) while presenting
a modern web UI, with a single security boundary.

### Decision
Strict three tiers: React SPA (presentation + optimistic state), Node/Express
(authority: validation, security, queue, history, engine lifecycle), Python
engine (all media work). Browser never talks to Python or YouTube directly.

### Reason
Isolates security-critical validation in one tier; isolates dependency churn
(yt-dlp updates) in the engine; lets each tier use its native tooling.

### Consequences
Two process boundaries (HTTP/WS, NDJSON stdio) that must stay versioned and
tested; slightly more moving parts in exchange for clean ownership.

*Evidence:* repo structure (`src/`, `web/`, `python-engine/`),
`docs/codebase/ARCHITECTURE.md`.

---

## ADR-002 — Backend in plain ESM JavaScript (`.mjs`), no TypeScript

### Context
Backend surface is small, glue-heavy, and dominated by one protocol (NDJSON);
the frontend already carries type safety.

### Decision
Backend stays plain ESM `.mjs` on Express 5; no backend TypeScript.

### Reason
Deliberate convention (documented in `docs/codebase/STACK.md`): lower build
friction where the main risk is protocol correctness, which is covered by
node:test suites.

### Consequences
Less compile-time safety in `web/`; mitigated by tests and strict validation
(`web/validate.mjs`).

---

## ADR-003 — JSON file storage for history (no database)

### Context
History is append-mostly, local, and must survive restarts without asking users
to run or back up a database.

### Decision
Persist history to `web/data/history.json` with atomic temp-file + rename
writes (`web/services/historyService.mjs`, `historyPersistence.mjs`).

### Reason
Zero-dependency, inspectable, trivially backed up; sufficient for single-user
localhost scale.

### Consequences
No concurrent multi-user writes; no query engine. Schema additions (e.g.
thumbnails — N-11) must remain backward-compatible with existing files.

---

## ADR-004 — One-way WebSocket broadcasts; REST stays authoritative

### Context
Progress, logs, and status must be live, but the server remains the authority
for job state (client keeps optimistic state only).

### Decision
WebSocket (`ws`) is server → client broadcast only; state mutations and
queries go through REST; client reconciles via status/history snapshots
(reconnect reconciliation — `plans/006`).

### Reason
Simpler and safer than a two-way channel; no new RPC attack surface on the WS.

### Consequences
Client must handle reconnect reconciliation itself (implemented and planned in
plans/006).

---

## ADR-005 — Dark-only UI theme with CSS-first Tailwind v4 tokens

### Context
The product targets a premium dark aesthetic; maintaining two themes doubles
QA surface for a single-user tool.

### Decision
Single dark theme defined by `@theme` tokens in `src/styles.css` (Sora +
JetBrains Mono self-hosted via `@fontsource`); no light mode.

### Reason
Consistent identity with the logo's dark foundation; fewer visual states to
verify.

### Consequences
No `prefers-color-scheme` support; documented in `docs/design-system.md`.

---

## ADR-006 — Pinned, hash-locked Python dependencies; pytest stays `<9.0`

### Context
CI must be reproducible and immune to breaking releases of fast-moving deps
(yt-dlp) and test tooling.

### Decision
`python-engine/requirements.lock` pins exact versions with hashes; pytest is
deliberately pinned `<9.0`.

### Reason
Hash-locked installs make CI auditable; a pytest 9 migration is a deliberate
future change, not an accidental one (the Dependabot PR proposing >=9 is
expected to be declined).

### Consequences
Periodic manual upgrade work; documented exception to "keep dependencies
latest".

---

## ADR-007 — Honest failure reporting (warnings on the wire, verification)

### Context
Audits found features that existed only in code but were never carried on the
wire (warnings, yt-dlp skip markers) — unit tests passed while the feature was
dead in practice.

### Decision
The engine carries `warnings` and verification results end-to-end
(NDJSON → WS → UI), and the server treats honest failure (missing FFmpeg,
codec mismatch, duplicate-title collision) as a first-class outcome.

### Reason
Trust requires the UI to show exactly what the engine decided; silent success
is a correctness bug (duplicate-title data loss was fixed with an id-suffix
filename retry).

### Consequences
Every engine result field added later must be verified **on the wire** (live
test), not just in unit tests.

---

## ADR-008 — Product identity: "YTDL Modern" → "YTDL Flow"; internal names unchanged

### Context
The repository was re-published as `nishanth-kkj9/ytdl-flow`; user-facing
branding and internal identifiers had diverged.

### Decision
Rename all user-facing branding (README, UI header, page title, placeholder
page, server banner, package descriptions) to YTDL Flow; keep internal
identifiers (`ytdl_modern`) unchanged.

### Reason
Branding is user-facing; renaming internal packages would touch imports, CI
paths, and history for zero functional gain.

### Consequences
Docs must explain the historical mapping (done in `AGENTS.md`,
`docs/product.md`); future migrations require an explicit decision here.

---

## ADR-009 — Logo reference is an immutable raster original

### Context
The supplied YTDL Flow logo is a raster PNG with baked-in background and
wordmark; small-size UI uses need variants the original cannot provide
directly.

### Decision
Keep the original untouched at `references/branding/ytdl-flow-logo.png` as the
single source of truth; allow only clearly separated square derivatives under
`public/branding/`, created only when technically necessary.

### Reason
Preserves brand integrity and provenance; avoids an unmaintainable set of
recreated vector "lookalikes".

### Consequences
Small-size uses (favicon) currently use an inline placeholder until a
derivative is actually needed (tracked in `docs/roadmap.md` Ideas).

