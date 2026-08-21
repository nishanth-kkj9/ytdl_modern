# YTDL Modern — UI Flow Restructure (Approach B) — Design

## Context
YTDL Modern is a local YouTube downloader: React 19 + TypeScript + Zustand + Tailwind v4 frontend, Node/Express + WS backend, Python yt-dlp engine. Current layout is single centered column (`max-w-5xl`): header → UrlInput → ProbeCard/EmptyState → FormatPicker → WaveformProgress → MetadataPanel → LogPanel, with queue/history hidden in a drawer. Design system is "Capture Deck" — dark (#08080D), amber (audio) / cyan (video) dual accent, Sora + JetBrains Mono, pulsing REC dot, waveform bars.

Build is clean (`vite build` passes, 244kB JS gz 74kB). No visual regressions expected beyond intentional reorder.

## Problem
1. **Flow backwards** — FormatPicker sits below ProbeCard, but format/mode must be chosen BEFORE adding to queue. User flow is paste → probe → scroll down → set format → scroll up → Add. Friction on every download.
2. **Queue hidden** — Active downloads render inline (WaveformProgress) but queued items only in drawer behind hamburger. Low discoverability.
3. **Weak hierarchy** — Probe and Add share same `btn-audio`/`btn-video` weight; no primary vs secondary. EmptyState is 360px tall with instructional grid, wastes space. Header crams engine dot + 2 tags + mode tag + hamburger into one row.

## Goals
- Fix flow: format/mode selection colocated with URL input, above probe result.
- Surface queue: inline summary below input when queue non-empty; drawer remains for full history.
- Tighten hierarchy: Probe = secondary, Add = primary, compact empty state, header breathing room.
- Zero store/API/WS changes. Keep design tokens, keep single column, keep drawer.

## Non-Goals
- Two-panel / deck layout (approach C) — deferred; can revisit if inline summary proves insufficient.
- New dependencies, new routes, new engine features, design token changes.
- Full visual redesign — palette, type scale, and component primitives stay.

## Architecture
Single-column order changes in `App.tsx`; no new route or store. `FormatPicker` ceases to be standalone page section and becomes an inline control group inside `UrlInput` (either merged file or `FormatControls` sub-component). All state stays in `useDownloadStore` (`selectedMode`, `selectedFormat`, `selectedQuality`, `queue`, `probeInfo`).

```
Header (logo + engine dot + single queue badge + mode tag + drawer button)
┌─────────────────────────────────────────────┐
│ UrlInput + FormatControls (one card)        │
│  row1: [URL field          ] [Probe] [Add]  │  Probe=btn-ghost, Add=btn-audio/btn-video
│  row2: [Audio ● Video]  [Format ▾] [Quality ▾]  + format summary hidden (redundant)
│  row3: queued: 2 · show queue  (only if queue.length>0)
├─────────────────────────────────────────────┤
│ ProbeCard OR EmptyState (compact, 180px)    │
├─────────────────────────────────────────────┤
│ WaveformProgress (active only, unchanged)   │
├─────────────────────────────────────────────┤
│ MetadataPanel + LogPanel (unchanged)        │
└─────────────────────────────────────────────┘
DrawerPanel unchanged — full queue/history list, still accessible via header button.
```

## Components

### UrlInput.tsx (primary change)
- Add imports: `selectedMode`, `setSelectedMode`, `selectedFormat`, `setSelectedFormat`, `selectedQuality`, `setSelectedQuality`, `queue` from store.
- Inline control group below URL row: audio/video toggle (existing FormatPicker toggle markup, compacted), two `<select>` for format and quality (existing `audioFormats`/`videoFormats`/`audioQualities`/`videoQualities` arrays). Reuse `.select-input` class.
- Button hierarchy: Probe → `btn-ghost`, Add → `btn-audio` or `btn-video` per mode (filled).
- Queue summary row: when `queue.length > 0`, render `queued: N · downloading: M` + link/button that opens drawer or scrolls to WaveformProgress. Minimal — not full queue list.
- Remove "Will save as" summary block (redundant once controls are inline and Add is primary).
- Keep: YouTube regex validation, clear button, status row, probe error alert, Enter→probe, all aria attributes.

### FormatPicker.tsx
- Delete file, or keep as `FormatControls.tsx` sub-component imported by UrlInput. Prefer delete + inline to avoid indirection. Arrays (`audioFormats` etc.) move into UrlInput or shared `src/constants/formats.ts` if reuse needed elsewhere.

### EmptyState.tsx
- `min-h-[360px]` → `min-h-[180px]` (or `py-8`), reduce `mb-5` on badge, tighten heading to `text-base`, shorten copy to one line, replace 2-col `<ul>` grid with two inline pills (`A`/`V` + label) in one row.

### App.tsx
- Remove `import { FormatPicker }` and `<FormatPicker />` line.
- Order becomes: `<UrlInput />` → `{probeInfo ? <ProbeCard/> : <EmptyState/>}` → `<WaveformProgress/>` → `<MetadataPanel/>` → `<LogPanel/>`.
- Header: merge `activeCount` + `queuedCount` into single badge `queue.length` (or keep active badge only, drop queued tag). Keep engine dot + mode tag.

### DrawerPanel.tsx, ProbeCard.tsx, WaveformProgress.tsx, etc.
- No functional change. Drawer remains full queue/history view.

## Data Flow
No change. `probeUrl`, `enqueueDownload`, `cancelDownload`, `loadHistory` same. WS events same (`probe_result`, `download_started`, `progress`, `result`, `error`, `fatal_error`). Validation (`validate.mjs`) unchanged.

## Error Handling
Same. Probe error renders in UrlInput card. Download errors render via `result` with `success:false` in WaveformProgress/MetadataPanel. No new error paths.

## Styling
Reuse existing tokens (`--color-bg`, `--color-accent-audio`, `--color-accent-video`, `.card`, `.btn-*`, `.tag-*`, `.select-input`). No new CSS or token changes. Inline queue summary uses `border-border/60 bg-bg/50 rounded-xl` same as status row.

## Testing
- `npm run build` must pass (tsc + vite).
- `npm run test:smoke` against running server if available.
- Manual visual check: valid URL → Probe → probe result appears → format controls reflect mode → Add → WaveformProgress appears → queue summary updates → drawer still works.
- No new unit tests required; change is presentational reorder.

## Rollout
Single commit touching 3-4 files. Revert is `git revert` of that commit. No migration, no config change.
