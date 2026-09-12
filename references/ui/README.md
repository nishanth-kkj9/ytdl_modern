# references/ui — UI Reference Material

## What belongs here

- Screenshots of the current UI (for regression comparison and onboarding).
- Approved mockups or design explorations supplied by the product owner.
- Small annotated captures used to communicate intended layout/behavior.

## What does NOT belong here

- Production image assets for the app (those go in `public/` or `public/branding/`).
- The authoritative logo (that lives in `references/branding/`).
- Stale screenshots that no longer match the shipped UI — delete or clearly
  date-stamp replacements instead of accumulating outdated captures.

## How coding agents must use this material

- When a task refers to a specific UI appearance or behavior, check for a
  matching capture here first; treat it as design intent alongside
  `docs/design-system.md`.
- UI captures are **evidence, not code**: do not copy pixel values from a
  screenshot when a verified design token exists in `src/styles.css` — the
  token wins; the screenshot explains usage.
- Name files descriptively (e.g. `2026-09-downloads-drawer.png`).
