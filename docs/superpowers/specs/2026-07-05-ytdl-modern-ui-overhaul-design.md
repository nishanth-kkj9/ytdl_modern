# YTDL Modern UI Overhaul Design

**Date:** 2026-07-05
**Status:** Approved design

## Overview

Full UI overhaul of ytdl_modern — a Tauri v2 + React 19 desktop YouTube downloader. Redesign layout, component architecture, animations, and responsive behavior while fixing identified UX issues. Also clean ~1000 lines of dead PyQt6 code from the Python engine.

## Design Direction

- **Tone:** Polished media app — sleek, atmospheric, like Spotify/IINA. Cover art prominence, smooth transitions, refined dark theme.
- **Audience:** Users who repeatedly download YouTube content. Need to scan queue/history quickly, see download progress at a glance.
- **Palette:** Dark-only. Deeper blacks (`#0A0A0F`), refined surface hierarchy. Amber audio / Cyan video accents preserved.
- **Memorable detail:** Sidebar-driven navigation with cover art as the visual anchor in the main area.

## Layout

### Window
- Default size: 1050×720 (up from 800×600)
- Min size: 800×600
- Two-column layout works at 1050px; single-column responsive fallback below 900px

### Structure
```
┌──────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌────────────────────────────────────┐│
│ │  SIDEBAR   │ │  URL Input Bar        [P]  [Add]   ││
│ │  (270px)   │ ├────────────────────────────────────┤│
│ │            │ │  ┌──────────────────────────────┐   ││
│ │  Downloads │ │   │   Cover Art (album-style)    │   ││
│ │  History   │ │   │   Title • Uploader • Duration │   ││
│ │  (toggle)  │ │  └──────────────────────────────┘   ││
│ │            │ │  Format Picker — mode/format/quality ││
│ │  [counts]  │ │                                     ││
│ │  [status]  │ │  OR (during download):              ││
│ │            │ │  ┌──────────────────────────────┐   ││
│ │            │ │  │   Waveform + Progress + Stats │   ││
│ │            │ │  └──────────────────────────────┘   ││
│ │            │ ├────────────────────────────────────┤│
│ │            │ │  Log Panel (collapsible)            ││
│ └────────────┘ └────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Responsive behavior
- **≥1050px:** Full two-column layout
- **900–1049px:** Sidebar collapses to icon-only (48px), expands on hover/focus
- **<900px:** Sidebar becomes a bottom drawer/overlay, content is single-column

## Sidebar (270px)

### Visual
- Surface: `#0E0E18` (darker than main `#141420`)
- Subtle right border: `rgba(255,255,255,0.04)`
- Scrolled independently from main area

### Top
- App logo/name + engine status dot (green pulse = ready, red = error, yellow = starting)
- Two pill tabs: **Downloads** (count badge) | **History** (count badge)

### Downloads tab
- Each item: thumbnail (32×32 rounded), title (1-line trunc), status icon, mini progress bar (if active)
- Status colors: waiting (dim `#666`), downloading (amber pulse), complete (green `#22C55E`), failed (red `#EF4444`)
- Active item gets amber left border (2px)
- Right-click context menu: Remove, Retry, Reveal in Folder

### History tab
- Each item: thumbnail, title, format tag, date, file size
- Open/Folder icon buttons on hover (fade in)
- Empty state: "No downloads yet" with subtle download icon

### Bottom (always visible)
- Stats line: "3 active · 12 completed"
- Download directory path (clickable — opens in explorer)

### Behavior
- Click sidebar item → show full details in main area
- Items animate in with slide-down (200ms ease-out)
- Completed items get brief green glow before transitioning to history tab

## Main Content Area

### URL Input Bar (sticky top)
- Input with leading link icon, placeholder text
- Probe button (left) and Add to Queue button (right)
- Buttons disabled when input invalid, show loading spinner during probe
- Keyboard: Enter → Probe, Ctrl+Enter → Add, Esc → clear

### State: Idle
- Centered empty state: app logo + "Paste a link to get started" prompt
- Subtle version/build info at bottom

### State: Probe Result
- Cover art: 280px wide, 16:9 rounded corners, subtle glow shadow
- Metadata: title, channel, duration, resolution/bitrate
- Format picker integrated into card:
  - Audio/Video toggle (pill switch)
  - Format dropdown (mp3/opus/aac/m4a/wav or mp4/webm/mkv/avi)
  - Quality dropdown (Maximum/High/Medium/Low)
- Collapsible "Show all formats" detail section below card
- "Add to Queue" button — amber for audio mode, cyan for video mode

### State: Download Active
- Cover art shrinks to 80×45 thumbnail top-left
- Title + percentage prominently displayed
- Progress bar: smooth gradient fill, no re-trigger animation on each tick
- Waveform: 48 animated bars, stable React keys (no re-render jank)
- Stats row: speed, downloaded/total, ETA — monospace tabular numbers
- Cancel button (with confirmation dialog: "Cancel download?")

### Log Panel (bottom, collapsible)
- Default collapsed, shows count "Engine Log (3)"
- Expand on click, max-height with scroll
- Color-coded entries: red for errors, amber for warnings, dim for info
- Fixed: detect errors by structured type field, not string matching

## Component Architecture Changes

### New components
- `Layout.tsx` — sidebar + main area shell, responsive logic
- `Sidebar.tsx` — sidebar container with tab management
- `SidebarItem.tsx` — individual sidebar download/history item
- `ProbeCard.tsx` — cover art + metadata + format picker composite
- `EmptyState.tsx` — idle state with prompt
- `ConfirmDialog.tsx` — reusable confirmation modal (e.g., cancel download)

### Modified components
- `UrlInput.tsx` — simplify to just the input bar, move result display to ProbeCard
- `FormatPicker.tsx` — integrate into ProbeCard (may keep as sub-component)
- `WaveformProgress.tsx` — fix animation jank, integrate into main area
- `DownloadQueue.tsx` — becomes Sidebar's "Downloads" tab content
- `HistoryTable.tsx` — becomes Sidebar's "History" tab content
- `LogPanel.tsx` — collapsible, better error detection

### Removed
- Separate probe result card from UrlInput — merged into ProbeCard

## Animation & Transition Spec

| Transition | Duration | Easing | Implementation |
|---|---|---|---|
| Idle → Probe result | 300ms | ease-out | Opacity crossfade on content wrapper |
| Download start | 400ms | ease-out | Cover art shrinks, waveform expands |
| Progress bar fill | 300ms | ease-out | CSS `transition: width 300ms` |
| Sidebar item add | 200ms | ease-out | Height expand + opacity |
| Sidebar item complete | 600ms | ease-out | Green glow flash (CSS keyframe) |
| Sidebar item fail | 400ms | ease-in-out | Horizontal shake (CSS keyframe) |
| Collapsible panels | 250ms | ease-out | Max-height transition |
| Button hover | 100ms | ease-out | `transform: scale(1.02)` |
| Cover art load | 200ms | ease-out | Fade in from skeleton |

## Bug Fixes (included)

1. **Hardcoded download path** — `lib.rs`: use Tauri's app data dir or user-configured path instead of `D:\my_projects\downloads`
2. **HTML entity in status message** — Replace `&mdash;` string with actual `—` (Unicode U+2014)
3. **Race condition in useEngineEvents** — Ensure `downloadBase` is resolved before processing events
4. **Animation re-trigger** — Use stable keys on waveform bars, don't apply fade-in animation on every render
5. **Engine status indicator** — Show real engine state (starting/ready/error), not always green
6. **Cancel without confirmation** — Add confirmation dialog before cancelling download
7. **Format list is local function** — Extract `FormatRow` as proper component to avoid re-creation on each render

## Python Engine Cleanup

### Files to remove
- `python-engine/workers.py` — 600+ lines of PyQt6 QThread code (unused)
- `python-engine/constants.py` — QSS stylesheets (unused)
- `python-engine/settings.py` — legacy JSON settings (unused)
- `python-engine/history_db.py` — SQLite history (unused, frontend uses localStorage)

### Files to keep and simplify
- `ipc_main.py` — remove any PyQt6 references
- `engine.py` — remove dead code paths for legacy UI
- `helpers.py` — keep as-is
- `logger.py` — keep as-is

### Build artifacts
- Update `ytdl-engine.spec` to exclude removed files

## Files to clean from root
- Remove `tmp_probe_capture.py`, `tmp_probe_test.py`, `tmp_probe_capture.txt` (leftover test files)

## Implementation Order

1. Clean up Python engine (remove dead files, simplify)
2. Create new component structure (Layout, Sidebar, ProbeCard, EmptyState, ConfirmDialog)
3. Rewrite App.tsx for new layout
4. Refactor existing components (UrlInput, WaveformProgress, LogPanel)
5. Add animations and transitions
6. Apply responsive behavior
7. Fix bugs (hardcoded path, race condition, HTML entity, etc.)
8. Update Tauri config (window size)
9. Clean up root tmp files
