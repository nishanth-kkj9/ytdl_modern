# YTDL Flow — Branding

## Identity

- **Product name:** YTDL Flow
- **Meaning:** *YTDL* = YouTube Downloader. *Flow* = the controlled flow from
  media discovery through downloading, processing, verification, and
  status/history.
- **Status:** current. The product was previously published as "YTDL Modern";
  user-facing surfaces have been renamed to YTDL Flow. Internal identifiers
  (`ytdl_modern`) are technical names and are **not** branding.

## The authoritative logo

| Property | Value |
|----------|-------|
| Canonical file | `references/branding/ytdl-flow-logo.png` |
| Format | PNG raster, RGBA — **not** an SVG source |
| Dimensions | 1024 × 1036 px |
| Size | 1,388,070 bytes |
| SHA-256 | `811EE563171707EDBF47DF81A744B795A0175A8AADC22F6837B9D68E9139ADE5` |

### Documented characteristics (from the supplied original)

The logo is a full-bleed composition on a deep graphite/slate background with
soft radial lighting (near-black edges, lighter center glow). It consists of:

1. **App tile** — a rounded-square (squircle-like) badge with a strong corner
   radius, filled with a brushed-metallic **purple/indigo gradient** (dark
   indigo base, lighter purple sheen top-left).
2. **Emblem** — an interlocking composition of a **right-pointing play
   triangle** (glassy purple, outlined) woven with a **beamed double eighth
   note** (music note) in brushed **rose/copper metallic**. The play outline
   passes over and behind the note, giving layered depth with embossed
   highlights and shadows.
3. **Wordmark** — **"YTDL FLOW"** in brushed silver/white metallic capitals
   (wide geometric sans-serif) with a soft drop shadow, set below the tile.

### Visual identity notes

- The logo's brand palette is **dark slate + purple/indigo + rose metallic +
  silver** — this is the *brand* identity and is distinct from the product's
  *UI accent* palette (cyan for video, amber for audio — see
  `docs/design-system.md`). Both share the premium dark foundation
  (`#08080D`), but **the logo colors are not UI token colors** and must not be
  remapped to them.
- The relationship between the play symbol and the music note (interlocking,
  note in front, layered metallic depth) is part of the identity.

## Logo rules (binding)

- Preserve geometry, proportions, colors, and the play/music relationship.
- Do not redesign, recreate as SVG, replace with a generic or icon-library
  icon, simplify, recolor, or regenerate the logo.
- The original file is immutable. Any production asset must be a **separate
  derivative** under `public/branding/` — never an edit of the reference file.
- Do not create derivatives unless technically necessary.

## Usage

| Surface | Guidance |
|---------|----------|
| Application header | Text wordmark ("YTDL Flow") currently; the logo image may be introduced as a header asset using the tile emblem only (square derivative) so the header stays compact. |
| Navigation / drawer | Prefer the square tile-emblem derivative at small sizes; keep clear space around it. |
| Landing / no-build placeholder page | Full logo or emblem; must sit on a dark background consistent with `#08080D`. |
| Favicon | Currently an inline SVG placeholder play glyph. May be migrated to a square derivative under `public/branding/` when the app adopts real image assets — derivative creation only when this is actually needed. |
| Documentation | Reference the canonical path `references/branding/ytdl-flow-logo.png`; do not duplicate the file. |
| README | May embed the logo at the top; link or copy under `public/branding/`, never move the original. |

### Small UI locations

For favicons, avatars, or compact header slots, a **square icon derivative**
(cropped to the tile emblem, transparent or dark background) may be produced
from the original **only when technically necessary**, stored under
`public/branding/` (e.g. `ytdl-flow-icon.png`). The crop must preserve the
emblem's geometry and colors exactly; the original reference file is never
replaced by the derivative.
