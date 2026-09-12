# references/architecture — Architecture Reference Material

## What belongs here

- External diagrams, exports of diagrams, or captures of external systems that
  inform the architecture (e.g. a sequence sketch of the NDJSON protocol).
- Reference material about third-party integrations (yt-dlp output format
  samples, FFmpeg flag references, etc.) that agents should consult before
  changing engine behavior.

## What does NOT belong here

- The canonical architecture documentation — that is `docs/architecture.md`
  (with the deep dive in `docs/codebase/ARCHITECTURE.md`). This directory holds
  *reference input*, not maintained documentation.
- Anything generated automatically from the code (diagrams should be regenerable
  from the Mermaid sources in `docs/`).

## How coding agents must use this material

- Before changing protocol, IPC, or engine behavior, check this directory for
  reference material that pins the expected wire format.
- Reference captures are snapshots: if they contradict the current code, the
  **code** wins — flag the stale reference instead of "fixing" the code to match
  an outdated capture.
