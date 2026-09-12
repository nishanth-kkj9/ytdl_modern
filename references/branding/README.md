# references/branding — Authoritative Brand Assets

## What belongs here

- The **canonical YTDL Flow logo** and other brand source material supplied by
  the product owner.
- Files in this directory are the **source of truth** for visual identity.

## Current contents

| File | Role |
|------|------|
| `ytdl-flow-logo.png` | **The authoritative YTDL Flow logo** (original raster, PNG, 1024×1036, RGBA). See `docs/branding.md` for documented characteristics and usage rules. |

## What does NOT belong here

- Derivatives, crops, exports, or app production assets — those belong under
  `public/branding/` (created only when technically necessary).
- UI screenshots or mockups (those belong in `references/ui/`).
- Anything that is not original reference material.

## How coding agents must use this material

1. Treat `ytdl-flow-logo.png` as **immutable** — never edit, re-export, convert,
   or replace it.
2. Never recreate the logo as SVG or generate a substitute.
3. Before any branding-related change, read `docs/branding.md` and inspect the
   reference image itself.
4. Reference the canonical path (`references/branding/ytdl-flow-logo.png`) in
   documentation; do not duplicate the file elsewhere.

**Integrity:** SHA-256
`811EE563171707EDBF47DF81A744B795A0175A8AADC22F6837B9D68E9139ADE5`
(1,388,070 bytes). If a local copy's hash differs, it is not the original.
