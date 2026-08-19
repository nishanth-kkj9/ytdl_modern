# Type, Spacing & A11y Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared type scale, spacing tokens, and a standardized section header pattern across all panels; fix the drawer focus retention and unlabeled form field a11y warnings found in MCP walkthrough.

**Architecture:** Pure CSS token addition + class rename + attribute additions. Three phases that ship independently:
1. CSS tokens & classes (visual diff: none yet)
2. Section header migration across panels (visual diff: subtle consistency)
3. A11y fixes (DrawerPanel `inert` + focus restore; button audit)

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + Zustand (existing). No new dependencies.

## Global Constraints

- Two font families only: **Sora** (UI text) and **JetBrains Mono** (numeric/file/metric content). No tertiary font.
- Zero new dependencies.
- Zero layout/component redesigns — only class renames, attribute additions, and one CSS file additions.
- Each phase builds cleanly so the working app stays shippable between phases.
- No new animation/motion changes. No color token additions.
- `npm run build` must exit 0 after every task.
- Manual MCP walkthrough (Chrome DevTools) confirms each phase before moving on.

---

## File Structure

**Files modified:**
- `src/styles.css` — add type classes, spacing tokens, refactor `.section-label` → `.eyebrow`
- `src/components/FormatPicker.tsx` — rename `section-label` → `eyebrow`
- `src/components/ProbeCard.tsx` — rename `section-label` → `eyebrow`
- `src/components/LogPanel.tsx` — rename `section-label` → `eyebrow` + button `type="button"`
- `src/components/DrawerPanel.tsx` — `inert` + focus restore + button audit
- `src/components/MetadataPanel.tsx` — `.eyebrow` on existing eyebrow text
- `src/components/Sidebar.tsx` — button audit (`type="button"`, aria-label where missing)
- `src/components/EmptyState.tsx` — apply `.display` class

**No new files.**

---

### Task 1: Add type & spacing tokens to styles.css

**Files:**
- Modify: `src/styles.css` (append type classes inside `@layer components` near existing `.section-label`; append spacing tokens in `@layer base :root`)

**Interfaces:**
- Consumes: existing `@theme` block (lines 5–27) with `--color-*`, `--font-display`, `--font-mono`
- Produces: utility classes `.display`, `.headline`, `.title`, `.body`, `.caption`, `.eyebrow`, `.metric`; CSS variables `--space-1`..`--space-12` and `--space-section-gap`, `--space-panel-padding`, `--space-control-padding`

- [ ] **Step 1: Locate insertion points**

Open `src/styles.css`. Find the `@layer base { :root { ... } }` block (around line 29–32). Note where to append spacing tokens. Find the `.section-label` block at line 333. Note where to refactor it to `.eyebrow` and add adjacent type classes.

- [ ] **Step 2: Add spacing tokens inside `:root`**

Inside the `@layer base { :root { ... } }` block, append:

```css
  /* Spacing tokens */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;

  --space-section-gap:   var(--space-5);
  --space-panel-padding: var(--space-6);
  --space-control-padding: var(--space-3);
```

- [ ] **Step 3: Refactor `.section-label` → `.eyebrow` and add type classes**

In the `@layer components` block, replace the `.section-label` rule at line 333 with:

```css
  /* Type scale */
  .display {
    font-family: "Sora", sans-serif;
    font-weight: 600;
    font-size: 2rem;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }
  .headline {
    font-family: "Sora", sans-serif;
    font-weight: 600;
    font-size: 1.25rem;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }
  .title {
    font-family: "Sora", sans-serif;
    font-weight: 500;
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .body {
    font-family: "Sora", sans-serif;
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.55;
  }
  .caption {
    font-family: "Sora", sans-serif;
    font-weight: 400;
    font-size: 0.75rem;
    line-height: 1.45;
    color: #5A6B8A;
  }
  .eyebrow {
    font-family: "Sora", sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5A6B8A;
  }
  .metric {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.8125rem;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
```

The new `.eyebrow` replaces the old `.section-label` definition byte-for-byte; existing call sites still compile until Task 2.

- [ ] **Step 4: Build to confirm no regressions**

Run: `npm run build`
Expected: PASS (no errors; `.section-label` still defined elsewhere or through Tailwind JIT). If `.section-label` is referenced in JSX and now undefined, that's fine — Task 2 migrates those.

- [ ] **Step 5: Verify in browser**

Chrome DevTools MCP: navigate to `http://127.0.0.1:3000/`, snapshot, confirm app loads. Visual diff: none yet (existing classes unchanged; new classes available but unused).

---

### Task 2: Migrate `.section-label` → `.eyebrow` across panels

**Files:**
- Modify: `src/components/FormatPicker.tsx` (lines 87, 99)
- Modify: `src/components/ProbeCard.tsx` (line 79)
- Modify: `src/components/LogPanel.tsx` (line 23)
- Modify: `src/components/MetadataPanel.tsx` (eyebrow text)

**Interfaces:**
- Consumes: `.eyebrow` class from Task 1
- Produces: all existing panel eyebrow labels rendered via `.eyebrow`

- [ ] **Step 1: Find all `.section-label` call sites**

Run grep:
```bash
grep -rn "section-label" src/components
```

Expected matches: `FormatPicker.tsx` (×2), `ProbeCard.tsx` (×1), `LogPanel.tsx` (×1).

- [ ] **Step 2: Migrate `FormatPicker.tsx`**

Replace `className="section-label block"` → `className="eyebrow block"` at both call sites (lines 87 and 99).

- [ ] **Step 3: Migrate `ProbeCard.tsx`**

Replace `className="section-label"` → `className="eyebrow"` at line 79.

- [ ] **Step 4: Migrate `LogPanel.tsx`**

Replace `className="section-label"` → `className="eyebrow"` at line 23.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Visual verify in browser**

Chrome DevTools MCP: snapshot, confirm PROBE RESULT / FORMAT / QUALITY / ENGINE LOG headers still render with same uppercase, muted, small-caps appearance. No layout regression.

- [ ] **Step 7: Cleanup — remove old `.section-label` definition**

After all call sites migrated and the build still passes, delete the old `.section-label` block from `src/styles.css` (the new `.eyebrow` from Task 1 already replaces it; this is a safety delete). Confirm `grep -rn "section-label" src` returns nothing.

---

### Task 3: Apply `.eyebrow` + headline pattern to remaining panels

**Files:**
- Modify: `src/components/MetadataPanel.tsx`
- Modify: `src/components/DrawerPanel.tsx`
- Modify: `src/components/EmptyState.tsx`

**Interfaces:**
- Consumes: `.eyebrow`, `.headline`, `.display`, `.body` classes from Task 1

- [ ] **Step 1: Migrate `MetadataPanel.tsx`**

The panel currently uses raw text for "METADATA EMBEDDED". Find that span/h2 and ensure it has `className="eyebrow"`. Apply `.body` to the description prose (`mt-1 text-xs text-text-secondary` → add `.body`; rename `text-xs` is fine since `.body` sets font-size, but keep `text-text-secondary` for color).

- [ ] **Step 2: Migrate `DrawerPanel.tsx`**

The drawer heading is `<h2>Queue & History</h2>`. Add `className="headline"`. Already has `<button>Downloads</button>` / `<button>History</button>` tabs — those use `text-xs font-semibold`. Migrate to `className="eyebrow"` only if it improves the visual consistency; otherwise leave as-is. Goal: the panel title reads as headline + small subtitle/count.

- [ ] **Step 3: Migrate `EmptyState.tsx`**

The "Paste a link to get started" heading currently uses arbitrary classes (`text-2xl font-semibold tracking-tight text-text`). Replace with `className="display"` plus color override `text-text`. This is the only place `.display` is used.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Visual verify in browser**

Chrome DevTools MCP: navigate, snapshot, walk through idle → probe → add → drawer → log → history. Confirm:
- Empty state: bigger, more prominent title (using `.display`).
- ProbeCard eyebrow.
- Drawer heading reads cleanly.
- Metadata eyebrow.
- Log eyebrow.

No console errors. No layout regressions.

---

### Task 4: Fix drawer focus retention a11y warning

**Files:**
- Modify: `src/components/DrawerPanel.tsx`

**Interfaces:**
- Consumes: `open`, `onClose` props (existing); `aria-label="Open queue and history"` button in `App.tsx`
- Produces: drawer closes without "aria-hidden retains focus" warning; focus returns to trigger button on close

- [ ] **Step 1: Locate current close behavior**

In `DrawerPanel.tsx`, find the close handler (currently `onClose={() => setDrawerOpen(false)}` from App.tsx) and the close button (`aria-label="Close drawer"`). The aside currently has `aria-hidden={!open}`. The fix has two parts.

- [ ] **Step 2: Replace `aria-hidden` with `inert`**

In the `<aside>` element, replace `aria-hidden={!open}` with `inert={!open}`. `inert` is React 19 / modern HTML — declaratively blocks focus, clicks, and AT access in one attribute. React 19 accepts `inert` as a boolean prop.

Verify React 19 type compatibility: open the file; if TypeScript complains about `inert`, use `{!open ? { inert: "" } : undefined}` or a `useEffect` that toggles the attribute. Report any TS error in the next step.

- [ ] **Step 3: Add focus restore on close**

Add a `useEffect` that listens for the drawer transitioning from open → closed and moves focus back to the trigger button. The trigger has `aria-label="Open queue and history"` in `App.tsx`.

```tsx
useEffect(() => {
  if (!open) {
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open queue and history"]'
    );
    trigger?.focus();
  }
}, [open]);
```

Place this inside the DrawerPanel component (after the existing state hooks).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS (TS may flag `inert` on `<aside>` — handle by adding `// @ts-expect-error inert is HTML standard, React 19 may not yet type it` or by using `{!open && ({ inert: "" } as any)}` on the aside element. Pick whichever is least invasive.)

- [ ] **Step 5: Verify a11y warning is gone**

Chrome DevTools MCP:
1. Open drawer via header button.
2. Close drawer via close button.
3. Take console snapshot.
4. Expected: no "Blocked aria-hidden on an element because its descendant retained focus" warning.

Also verify focus: after closing, pressing Tab once should advance past the trigger (proves focus is on the trigger).

---

### Task 5: Audit buttons — `type="button"` and `aria-label`

**Files:**
- Modify: `src/components/LogPanel.tsx` (already has `type="button"` — verify)
- Modify: `src/components/DrawerPanel.tsx` (Cancel all, Clear history — verify)
- Modify: `src/components/Sidebar.tsx` (Downloads, History tab buttons)
- Modify: `src/components/SidebarItem.tsx` (open file, reveal in folder — already have aria-labels)
- Modify: any other component with `<button>` lacking `type` or `aria-label`

**Interfaces:**
- Consumes: existing button JSX
- Produces: every `<button>` has `type="button"` and either visible text or `aria-label`; console no longer logs "form field element should have id or name"

- [ ] **Step 1: Find every `<button>` in `src/components`**

Run grep for untyped buttons:
```bash
grep -rn "<button" src/components
```

Inspect each match. Flag buttons that:
- Are missing `type="button"` (default is `submit` if inside a `<form>`).
- Have no visible text and no `aria-label`.

- [ ] **Step 2: Add `type="button"` to all flagged buttons**

Walk through each. Add `type="button"` if missing. Example:
```tsx
<button onClick={...}> → <button type="button" onClick={...}>
```

For DrawerPanel: the `Close drawer`, `Downloads`, `History` tab buttons, `Cancel all`, `Clear history` — all need `type="button"` (no form context today, but defensive).

For Sidebar: Downloads/History tab buttons — add `type="button"`.

For LogPanel: already has `type="button"` at line 18 — verify all other `<button>`s do too.

- [ ] **Step 3: Audit `aria-label` on icon-only buttons**

For each `<button>` with no visible text content (icon-only):
- `SidebarItem.tsx` line 86 (`Open file`) — has `aria-label="Open file"` ✓
- `SidebarItem.tsx` line 100 (`Reveal in folder`) — has `aria-label="Reveal in folder"` ✓
- `DrawerPanel.tsx` close button — has `aria-label="Close drawer"` ✓
- `App.tsx` header drawer button — has `aria-label="Open queue and history"` ✓
- `FormatPicker.tsx` Audio/Video mode buttons — visible text ✓
- `WaveformProgress.tsx` Cancel button — has `aria-label` (verify)

Confirm every icon-only button has `aria-label`. Add where missing.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Verify in browser**

Chrome DevTools MCP: take console snapshot. Expected: no "A form field element should have an id or name attribute" warning.

---

### Task 6: Final MCP walkthrough — verify all acceptance criteria

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start clean MCP walkthrough**

Chrome DevTools MCP:
1. `chrome-devtools_navigate_page type=reload` — fresh load.
2. `chrome-devtools_take_snapshot` — confirm page renders, all controls present.
3. `chrome-devtools_list_console_messages types=warn` — record warning count.

- [ ] **Step 2: Mode rocker + format/quality cycling**

Click Audio → Video → Audio. Confirm rack-panel glow flips, format picker swaps.

- [ ] **Step 3: Full download lifecycle**

1. Type URL into input.
2. Click Probe.
3. Click Add.
4. Wait for completion (REC → finished).
5. Open drawer, confirm history item appears.
6. Click Clear history — verify drawer empties + history sidebar empties.
7. Close drawer — confirm focus returns to trigger button (Tab key advances past it).

- [ ] **Step 4: Console check**

Final `chrome-devtools_list_console_messages types=warn types=error`:
- Expected: zero a11y warnings (no "aria-hidden retains focus", no "form field id/name").
- Font decode warnings remain (out of scope).

- [ ] **Step 5: Smoke test**

Run: `npm run test:smoke`
Expected: 5/5 PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

---

## Self-Review

**Spec coverage:**
- ✓ Type scale (Task 1)
- ✓ Spacing tokens (Task 1)
- ✓ Section header pattern migration (Tasks 2, 3)
- ✓ Drawer focus retention fix (Task 4)
- ✓ Form field labels fix (Task 5)
- ✓ Form-button submit audit (Task 5)
- ✓ Verification (Task 6)

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in details". ✓

**Type consistency:** `inert` is React 19 standard. `.eyebrow` defined once in Task 1, referenced in Tasks 2 and 3. `.display` used only in Task 3 (EmptyState). ✓

**Risks noted inline:**
- React 19 TS typing of `inert` may need a workaround (Task 4 Step 2 + 4).
- Visual regression risk in Task 3 (new `.display` on EmptyState); verified by MCP walkthrough in Task 6.
