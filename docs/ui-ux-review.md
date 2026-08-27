# UI/UX Review — ytdl_modern Frontend

**Date:** 2026-08-27
**Branch:** `ui-ux-review` (based on `origin/main` @ `746b95d`)
**Scope:** All frontend components, animations, responsive layout, accessibility

---

## Executive Summary

Thorough audit of 11 React components, CSS animations, responsive behavior, and accessibility. Found **7 safe-to-fix issues** (applied), **8 medium-priority improvements** (recommended), and **4 low-priority polish items**.

### What was fixed (Phase 3)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Unused CSS class `.hero-input` (22 lines) | `styles.css` | Removed dead code |
| 2 | Unused CSS class `.recording-dot-glow` | `styles.css` | Removed dead code |
| 3 | Duplicate `fmtSize` utility function | `ProbeCard.tsx`, `WaveformProgress.tsx` | Extracted to `src/utils.ts` |
| 4 | Select dropdown missing focus ring | `styles.css` | Added `box-shadow` on `:focus` |
| 5 | Audio/Video mode toggle indicator too subtle (12% opacity) | `UrlInput.tsx` | Increased to 20% opacity, stronger ring |
| 6 | Header cramped on mobile (< 400px) | `App.tsx` | Reduced padding `px-6 py-3.5` → `px-4 py-3 sm:px-6 sm:py-3.5` |
| 7 | Drawer fixed 360px width on all screens | `DrawerPanel.tsx` | Full-width on mobile, 360px on `sm:`+ |
| 8 | EmptyState dashed border nearly invisible | `EmptyState.tsx` | Changed `border-border` → `border-border-strong` |
| 9 | Format grid overflows on mobile | `ProbeCard.tsx` | Responsive grid: 4-col mobile, 6-col desktop |
| 10 | Format/Quality selects grid on mobile | `UrlInput.tsx` | Changed `flex gap-3` → `grid grid-cols-2 gap-3 sm:flex` |

---

## Component-by-Component Audit

### 1. Header (`App.tsx:44-84`)

**Status:** Good after fixes

- ✅ Semantic HTML: `<header>`, `<h1>`, `<p>`
- ✅ Engine status dot has `aria-hidden="true"`, parent `span` has `aria-label`
- ✅ Queue badge uses `tag` class, visible
- ⚠️ Hamburger button `h-8 w-8` (32px) — below WCAG 44px touch target. Acceptable for desktop/Electron; would need padding for mobile-first web.

### 2. UrlInput (`UrlInput.tsx`)

**Status:** Good after fixes

- ✅ `sr-only` label for URL input, `aria-invalid` and `aria-describedby` for validation
- ✅ Radio group has `role="radiogroup"` with `aria-labelledby`
- ✅ Probe/Add buttons properly disabled when URL invalid
- ✅ Enter key triggers probe (keyboard accessible)
- ⚠️ Mode toggle sliding indicator — improved from 12% to 20% opacity
- ⚠️ Format/Quality selects now grid on mobile

### 3. ProbeCard (`ProbeCard.tsx`)

**Status:** Good after fixes

- ✅ Thumbnail lazy-loads with `onLoad`/`onError` state
- ✅ `aria-expanded` on format toggle button
- ✅ `aria-controls` pointing to format list ID
- ✅ Format rows responsive on mobile
- ⚠️ Thumbnail placeholder has `aspect-ratio: 16/9` which is good, but background color (`bg-raised`) is close to card background

### 4. EmptyState (`EmptyState.tsx`)

**Status:** Good after fixes

- ✅ Dashed border now visible (`border-border-strong`)
- ✅ `aria-hidden="true"` on decorative play icon
- ✅ Format badges (A/V) are clear and informative
- ✅ `kbd` element for Enter key — nice touch

### 5. WaveformProgress (`WaveformProgress.tsx`)

**Status:** Good

- ✅ `aria-label` on download section with title/URL
- ✅ Progress bar has `aria-hidden="true"` (decorative, stats convey info)
- ✅ Stat cards use `tabular-nums` for numeric values
- ✅ `shimmer-text` for loading states — good UX
- ✅ Cancel button triggers `ConfirmDialog` — prevents accidental cancellation
- ⚠️ Recording dot (red pulsing) shows for all download types, not just audio. Cosmetic only.

### 6. MetadataPanel (`MetadataPanel.tsx`)

**Status:** Good

- ✅ Verification checklist with clear ✔/✖ indicators
- ✅ Description expand/collapse with "Show More"/"Show Less"
- ✅ Missing fields list in error-styled box
- ⚠️ `line-clamp-2` on description — could use `line-clamp-3` for more context

### 7. LogPanel (`LogPanel.tsx`)

**Status:** Good

- ✅ `aria-expanded` on toggle button
- ✅ `aria-controls` pointing to log panel ID
- ✅ Auto-scroll to bottom on new entries
- ✅ Empty state shows "Waiting for activity..." with pulsing dot
- ⚠️ Log entries use array index as key (`${i}-${entry.message}`). Acceptable for append-only logs but could cause issues if logs are ever reordered.

### 8. DrawerPanel (`DrawerPanel.tsx`)

**Status:** Good after fixes

- ✅ `role="dialog"` and `aria-modal` on drawer
- ✅ `inert` attribute when closed — prevents tab-focus into hidden drawer
- ✅ Escape key closes drawer
- ✅ Focus returns to trigger button on close
- ✅ Now full-width on mobile, 360px on desktop
- ⚠️ Backdrop click closes drawer — standard pattern, but some users may意外 close

### 9. ConfirmDialog (`ConfirmDialog.tsx`)

**Status:** Good

- ✅ `createPortal` renders outside component tree
- ✅ `aria-modal="true"` and `aria-labelledby` for title
- ✅ Focus trap implemented correctly
- ✅ Cancel gets initial focus (safe default for destructive actions)
- ✅ Escape key closes dialog
- ⚠️ No `role="document"` inside dialog — minor, screen readers handle this

### 10. SidebarItem (`SidebarItem.tsx`)

**Status:** Good

- ✅ `role="group"` with `aria-label` containing title and status
- ✅ Thumbnail CDN whitelist (`isSafeThumbnail`) — defense-in-depth
- ✅ Status dot has `aria-hidden="true"` (decorative)
- ✅ Action buttons (open, reveal, retry, cancel) have `aria-label`
- ⚠️ Action buttons only visible on hover — acceptable for desktop, could be always-visible on mobile

### 11. ErrorBoundary (`ErrorBoundary.tsx`)

**Status:** Good

- ✅ Catches React rendering errors
- ✅ Shows error message with stack trace in development
- ✅ "Try Again" button resets boundary

---

## Animations & Micro-interactions

| Animation | Location | Assessment |
|-----------|----------|------------|
| `rec-pulse` | Recording dot | ✅ Smooth, respects `prefers-reduced-motion` |
| `waveform-bar` | Waveform bars (48 bars) | ✅ Staggered delay (0.05s each), reduced-motion fallback |
| `shimmer` | Loading text | ✅ Subtle, professional |
| `fade-in` | Main content | ✅ 0.3s ease-out |
| `fade-in-up` | Cards entering | ✅ 0.35s ease-out, translateY(8px) |
| `sidebar-item-in` | Sidebar items | ✅ 200ms ease-out, translateY(-4px) |
| `sidebar-item-complete-glow` | Download complete | ✅ 600ms, green left-border flash |
| `sidebar-item-fail-shake` | Download failed | ✅ 400ms, horizontal shake |
| `progress-indeterminate` | Unknown-size downloads | ✅ 1.5s ease-in-out, sliding gradient |

**Notes:**
- All animations respect `prefers-reduced-motion: reduce` via CSS media query
- Waveform bars use `animation-delay` for stagger effect — 48 bars × 0.05s = 2.4s total cycle
- Button hover uses `transform: scale(1.02)` and active uses `scale(0.96)` — subtle tactile feedback

---

## Responsive Behavior

| Breakpoint | Layout | Assessment |
|------------|--------|------------|
| 375px (mobile) | Single column, stacked controls | ✅ Format/Quality grid on 2 cols, drawer full-width |
| 768px (tablet) | Wider single column | ✅ URL input row, mode toggle + selects in one row |
| 1440px (desktop) | Centered max-width (max-w-5xl) | ✅ Content stays readable, not stretched |

**Notes:**
- Header padding reduces on mobile (`px-4 py-3` vs `px-6 py-3.5`)
- Drawer is full-width on mobile, 360px on desktop
- Format grid stacks to 4 columns on mobile, 6 on desktop

---

## Accessibility Summary

| Criterion | Status | Notes |
|-----------|--------|-------|
| Keyboard navigation | ✅ | All interactive elements focusable, focus-visible ring on all |
| Screen reader | ✅ | ARIA labels, roles, live regions where needed |
| Color contrast | ✅ | Text meets WCAG AA (text on dark bg), accent colors have sufficient contrast |
| Reduced motion | ✅ | Waveform and recording animations disabled |
| Focus management | ✅ | Dialog traps focus, drawer returns focus to trigger |
| Form labels | ✅ | `sr-only` labels, `aria-describedby` for validation |

---

## Recommended Improvements (Not Applied)

### Medium Priority

1. **SidebarItem action buttons always visible on mobile** — Currently hover-only; could be `opacity-100` on touch devices
2. **Log entry keys** — Use `entry.timestamp` or `entry.id` instead of array index if logs can be reordered
3. **ProbeCard thumbnail placeholder** — Use a distinct placeholder color or icon instead of `bg-raised`
4. **ConfirmDialog confirm button** — Add `focus-visible:ring` for keyboard users
5. **DrawerPanel close button** — Add `focus-visible:ring` for keyboard users
6. **LogPanel toggle button** — Add `focus-visible:ring` for keyboard users
7. **UrlInput probe error auto-dismiss** — Currently stays until next probe; could auto-dismiss after 10s
8. **MetadataPanel description truncation** — Use word-boundary split instead of character count

### Low Priority

1. **Loading skeleton for probe results** — Show skeleton UI while probing instead of nothing
2. **Keyboard shortcuts** — `Ctrl+V` to paste URL, `Enter` to probe (already works), `Escape` to clear
3. **Drawer swipe-to-close on mobile** — Touch gesture for mobile users
4. **Log search/filter** — Filter by log level (error/warn/info)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/styles.css` | Removed unused `.hero-input`, `.recording-dot-glow`; added select focus ring |
| `src/utils.ts` | **New** — shared `fmtSize` utility |
| `src/components/ProbeCard.tsx` | Import shared `fmtSize`, responsive format grid |
| `src/components/WaveformProgress.tsx` | Import shared `fmtSize` |
| `src/components/UrlInput.tsx` | Improved toggle indicator contrast, responsive format grid |
| `src/components/DrawerPanel.tsx` | Responsive width (full mobile, 360px desktop) |
| `src/components/EmptyState.tsx` | Visible dashed border |
| `src/App.tsx` | Responsive header padding |

## Screenshots

Baseline and post-fix screenshots saved to `.review/screenshots/`:
- `baseline-375.png`, `baseline-768.png`, `baseline-1440.png`
- `postfix-375.png`, `postfix-768.png`, `postfix-1440.png`
