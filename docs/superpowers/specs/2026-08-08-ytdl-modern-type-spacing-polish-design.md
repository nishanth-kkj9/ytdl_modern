# YTDL Modern — Type, Spacing & A11y Polish Design

**Date:** 2026-08-08
**Status:** Approved (brainstorming complete)

## Overview

Refine the existing "Capture Deck" identity so the app feels finished and modern without
abandoning the dark hardware aesthetic. One single pass that adds a shared type scale,
codifies spacing tokens, standardizes a section header pattern, and fixes real
accessibility issues found during end-to-end browser testing.

**In scope:** type tokens, spacing tokens, section header pattern, three a11y fixes.
**Out of scope:** new fonts, component redesigns, motion overhaul, color/atmosphere pass,
font-file decoding errors (separate issue).

## Goals

1. Document-wide typographic hierarchy so every panel reads as part of one product.
2. Consistent section header pattern (eyebrow + headline) across panels.
3. Eliminate the three real a11y warnings observed during MCP walkthrough.
4. Zero new dependencies; one CSS file + minimal React edits.

## Non-Goals

- No new fonts (Sora + JetBrains Mono stay).
- No redesign of any existing component's layout.
- No animation/motion changes.
- No color token additions.
- No design system documentation page.
- No font decoding fix (pre-existing broken `*.woff2` in `dist/assets/files/` — separate ticket).

## Design Decisions

### 1. Typography

Two font families only: **Sora** for UI text, **JetBrains Mono** for numeric/file/metric
content. No tertiary font.

Seven semantic type roles, exposed as utility classes in `styles.css`:

| Class       | Size      | Weight    | Family          | Notes                                    |
| ----------- | --------- | --------- | --------------- | ---------------------------------------- |
| `.display`  | 28–36px   | semibold  | Sora            | Empty-state hero only, tight tracking    |
| `.headline` | 18–22px   | semibold  | Sora            | Section titles (ProbeCard, panel titles) |
| `.title`    | 14–16px   | medium    | Sora            | Card subheaders                          |
| `.body`     | 13–14px   | regular   | Sora            | Paragraphs, line-height 1.55             |
| `.caption`  | 11–12px   | regular   | Sora            | Metadata, line-height 1.45               |
| `.eyebrow`  | 10–11px   | semibold  | Sora            | Uppercase, letter-spacing 0.08em         |
| `.metric`   | 12–13px   | regular   | JetBrains Mono  | Tabular numerals, download stats         |

`tabular-nums` already exists in `styles.css` (line ~403) and is applied to metrics via
the `.metric` class going forward. Today several "metric-like" texts use Sora; they get
migrated.

**Line lengths:** body text max ~65ch where it appears as prose (description in
MetadataPanel). Currently no prose blocks exist — add the constraint when one is added.

### 2. Spacing tokens

Add CSS custom properties at `:root` in `styles.css` for spacing. Tailwind v4 already
exposes default spacing; these are **semantic aliases** so future code references them by
intent (`--space-section`) not arbitrary number.

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px

--space-section-gap: 20px      /* between major sections */
--space-panel-padding: 24px    /* inside panels */
--space-control-padding: 12px  /* inside buttons/inputs */
```

These tokens are *defined but not aggressively re-applied*. Existing `gap-3`/`gap-4`
Tailwind utilities stay. The tokens exist to anchor future decisions and to give the
section header pattern a consistent rhythm.

### 3. Section header pattern

Standardize eyebrow + headline across every labeled section. Pattern:

```
.eyebrow               →  uppercase, muted, small
  .headline | .title   →  main label
[ .caption (optional) ] →  subtitle only when needed
```

Vertical gap between eyebrow and headline: `4px` (`gap-1`).

**Apply to these locations:**

| Location              | Eyebrow text         | Title                    | Today                 |
| --------------------- | -------------------- | ------------------------ | --------------------- |
| ProbeCard             | `PROBE RESULT`       | Track title              | Already partly there  |
| FormatPicker          | `FORMAT` / `QUALITY` | label on `<select>`      | Already `.section-label` (rename → `.eyebrow`) |
| MetadataPanel         | `METADATA EMBEDDED`  | "8 / 10 fields"          | Already partly there  |
| LogPanel              | `ENGINE LOG`         | count badge              | Already partly there  |
| DrawerPanel           | `QUEUE & HISTORY`    | (already heading h2)     | Normalize             |
| EmptyState            | —                    | "Paste a link to get started" | Already `.display`-ish |

Rename `.section-label` → `.eyebrow` (existing usage in FormatPicker migrates). The
"section header migration" phase and the FormatPicker rename are the same edit.
Existing `.tabular-nums` keeps its name (specific behavior, not just a metric).

### 4. A11y fixes

#### 4.1 Drawer focus retention (`aria-hidden` warning)

**Problem:** When DrawerPanel closes, `<aside aria-hidden={!open}>` becomes true while
focus is still inside the (now visually hidden) drawer. Browser logs an a11y warning.

**Fix:** Two-part fix in `src/components/DrawerPanel.tsx`:

1. Replace `aria-hidden={!open}` with `inert` attribute when closed. `inert` is the
   modern equivalent — blocks clicks, focus, and AT access in one attribute.
2. On close, programmatically move focus back to the trigger button. App.tsx already has
   `<button aria-label="Open queue and history">` in the header. Implementation:
   `document.querySelector('[aria-label="Open queue and history"]')?.focus()` on close
   (no React ref needed; aria-label is the contract).

Result: no more "Blocked aria-hidden on an element because its descendant retained
focus" warning in console.

#### 4.2 Unlabeled form fields (3 fields, "count: 3")

**Problem:** Browser console reports "A form field element should have an id or name
attribute (count: 3)".

**Fix:** Audit form-rendering components. Likely culprits:

- **LogPanel** — toggle/clear/copy buttons. They are `<button>`s inside a `<details>` or
  `<form>`. Add `type="button"` (prevents accidental submit) and `aria-label`.
- **DrawerPanel** — Cancel all / Clear history buttons already have visible text labels;
  no issue. But if any unlabeled control exists, add `aria-label`.

Concrete action: walk every `<button>` and `<input>` in the app, ensure each has either
visible text, an `aria-label`, or a wrapping `<label htmlFor>`. `type="button"` on
all non-submit buttons.

#### 4.3 Form-button submit behavior

**Problem:** The `ENGINE LOG` header is currently a `<button>` inside the panel. If
nested in a `<form>`, clicking it submits the form.

**Fix:** In LogPanel, ensure the toggle is `type="button"`. Audit other panels for the
same pattern.

## Implementation Strategy

Three phases, each small and self-contained:

1. **Type & spacing tokens** — `styles.css` only. Add classes, tokens. No component
   edits. Visual diff: nothing (yet).
2. **Section header migration** — replace `.section-label` with `.eyebrow`, apply
   eyebrow + headline pattern to all 6 locations. Visual diff: subtle consistency
   improvement.
3. **a11y fixes** — DrawerPanel inert + focus restore, audit & label buttons.

Each phase builds cleanly so the working app stays shippable between phases.

## Files Touched

- `src/styles.css` — add type classes, spacing tokens, refactor existing class.
- `src/components/FormatPicker.tsx` — rename `.section-label` → `.eyebrow`.
- `src/components/ProbeCard.tsx` — apply eyebrow pattern.
- `src/components/MetadataPanel.tsx` — apply eyebrow pattern, migrate metric labels.
- `src/components/LogPanel.tsx` — apply eyebrow pattern, `type="button"`, audit.
- `src/components/DrawerPanel.tsx` — `inert` + focus restore + button audit.
- `src/components/EmptyState.tsx` — apply `.display` class.
- `src/components/Sidebar.tsx` — audit buttons for `type="button"` + `aria-label`.

## Risks & Trade-offs

- **Low risk:** All changes are class renames, attribute additions, and 1 CSS file
  additions. Nothing structural.
- **Test coverage gap:** No existing automated UI tests beyond the smoke script. Manual
  MCP walkthrough after each phase.
- **Font decoding warning persists:** Out of scope. Pre-existing woff2 corruption in
  `dist/assets/files/` is a separate problem.

## Acceptance Criteria

1. `npm run build` exits 0.
2. `npm run test:smoke` passes (5/5).
3. Chrome DevTools MCP walkthrough — full lifecycle works:
   - Mode rocker flips glow
   - Probe → Add → Download completes
   - Drawer opens/closes, focus restored to trigger button
   - History populated and Clear history works
4. Console errors drop to zero from "Blocked aria-hidden..." and "form field should
   have id or name" categories. Font decode warnings remain (out of scope).

## Open Questions

None — all design decisions approved during brainstorming.
