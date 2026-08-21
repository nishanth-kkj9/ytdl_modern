# YTDL Modern UI Flow Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix backwards download flow by colocating format/mode selection with URL input, surfacing queue inline, and tightening visual hierarchy — without changing store, API, or design tokens.

**Architecture:** Reorder single-column layout in App.tsx; merge FormatPicker controls into UrlInput as inline group; compact EmptyState; header badge dedup. Pure presentational reorder — same Zustand selectors, same WS events, same routes.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4, Vite

## Global Constraints

- Keep design tokens/palette/type scale unchanged (amber #F59E0B audio, cyan #00B8D4 video, Sora + JetBrains Mono, dark #08080D).
- No new dependencies.
- No store/API/WS/engine changes.
- Single column stays; drawer stays for full history.
- `npm run build` (tsc + vite) must pass after each task.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/UrlInput.tsx` | Modify | URL input + inline format/mode/quality controls + queue summary + button hierarchy |
| `src/components/FormatPicker.tsx` | Delete | Standalone format picker (absorbed into UrlInput) |
| `src/components/EmptyState.tsx` | Modify | Compact empty state (180px) |
| `src/App.tsx` | Modify | Remove FormatPicker import/render, reorder sections, header badge dedup |

---

### Task 1: Inline format controls into UrlInput + queue summary

**Files:**
- Modify: `src/components/UrlInput.tsx`
- Modify: `src/components/FormatPicker.tsx` (read for arrays, then delete in Task 3 — keep file until then)

**Interfaces:**
- Consumes: `useDownloadStore` selectors `selectedMode`, `selectedFormat`, `selectedQuality`, `setSelectedMode`, `setSelectedFormat`, `setSelectedQuality`, `queue`, `probeInfo`, `probeUrl`, `enqueueDownload`, `setProbeInfo`, `statusMessage`, `probeError`
- Produces: UrlInput now renders URL row + format row + queue summary row in one card; no external API change

- [ ] **Step 1: Read current files to capture exact arrays and toggle markup**

Check `src/components/FormatPicker.tsx:3-30` for `audioFormats`, `videoFormats`, `audioQualities`, `videoQualities` arrays. Check `src/components/UrlInput.tsx:1-155` for current card structure. Check `src/stores/downloadStore.ts` for selector names.

- [ ] **Step 2: Edit UrlInput.tsx — add format state and inline controls**

Replace `src/components/UrlInput.tsx` content with merged version. Key changes vs current file:

```tsx
// Add to imports — no new deps
// Move these arrays from FormatPicker.tsx into UrlInput.tsx (or import from constants if preferred):
const audioFormats = [
  { value: "mp3", label: "MP3" },
  { value: "opus", label: "Opus" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "wav", label: "WAV" },
];
const videoFormats = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mkv", label: "MKV" },
];
const audioQualities = [
  { value: "maximum", label: "Maximum (best available)" },
  { value: "high", label: "High (192k)" },
  { value: "medium", label: "Medium (128k)" },
  { value: "low", label: "Low (96k)" },
];
const videoQualities = [
  { value: "best", label: "Best available" },
  { value: "2160p", label: "4K (2160p)" },
  { value: "1080p", label: "1080p Full HD" },
  { value: "720p", label: "720p HD" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
];

// Inside component, add:
const selectedMode = useDownloadStore((s) => s.selectedMode);
const selectedFormat = useDownloadStore((s) => s.selectedFormat);
const selectedQuality = useDownloadStore((s) => s.selectedQuality);
const setSelectedMode = useDownloadStore((s) => s.setSelectedMode);
const setSelectedFormat = useDownloadStore((s) => s.setSelectedFormat);
const setSelectedQuality = useDownloadStore((s) => s.setSelectedQuality);
const queue = useDownloadStore((s) => s.queue);
const formats = selectedMode === "audio" ? audioFormats : videoFormats;
const qualities = selectedMode === "audio" ? audioQualities : videoQualities;
const activeCount = queue.filter((i) => i.status === "downloading").length;
const queuedCount = queue.filter((i) => i.status === "queued").length;

// Button hierarchy: Probe uses btn-ghost, Add uses btn-audio/btn-video
// Probe button: className="btn btn-ghost shrink-0"
// Add button: className={`btn shrink-0 ${isAudio ? "btn-audio" : "btn-video"}`}

// New section below URL row, above status row:
// <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
//   {/* Mode toggle — compact pill, reuse FormatPicker toggle markup but smaller padding */}
//   {/* Two selects: Format + Quality, reuse .select-input, sm:w-40 each */}
// </div>

// Queue summary row (only if queue.length > 0):
// {queue.length > 0 && (
//   <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-bg/50 px-4 py-2.5 text-xs">
//     <span className="text-text-muted">{queuedCount > 0 ? `${queuedCount} queued` : ""}{queuedCount > 0 && activeCount > 0 ? " · " : ""}{activeCount > 0 ? `${activeCount} downloading` : ""}</span>
//     <span className="text-text-muted tabular-nums">{queue.length} in queue</span>
//   </div>
// )}

// Remove the old "Will save as" block entirely.
```

Keep all existing URL input behavior: regex validation, clear button, Enter→probe, handleProbe/handleAdd, status row, probeError alert. Only add inline controls and queue summary; change Probe/Add button classes.

- [ ] **Step 3: Verify build passes**

Run: `npm run build` from project root
Expected: `✓ built` with no TS errors. If `selectedMode` etc. selectors missing, check `src/stores/downloadStore.ts` for exact names.

- [ ] **Step 4: Commit**

```bash
git add src/components/UrlInput.tsx
git commit -m "feat(ui): inline format controls into UrlInput with queue summary"
```

---

### Task 2: Compact EmptyState

**Files:**
- Modify: `src/components/EmptyState.tsx`

**Interfaces:**
- Consumes: none (pure presentational)
- Produces: compact empty state rendered by App.tsx when `probeInfo` is null

- [ ] **Step 1: Edit EmptyState.tsx — reduce height and simplify**

Replace `src/components/EmptyState.tsx`:

```tsx
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-8 text-center">
      <div className="badge-play mb-4" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <h2 className="text-base font-semibold tracking-tight text-text">Paste a YouTube link to get started</h2>
      <p className="mt-1.5 max-w-md text-sm text-text-muted">
        Paste a link above, hit <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">Enter</kbd> or Probe to fetch metadata.
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
        <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-audio-dim text-[10px] font-bold text-accent-audio">A</span> Audio (MP3, Opus, M4A, WAV)</span>
        <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-video-dim text-[10px] font-bold text-accent-video">V</span> Video (MP4, WebM, MKV)</span>
      </div>
    </div>
  );
}
```

Key diff: `min-h-[360px] py-10 mb-5 text-lg mt-2 sm:grid-cols-2` → `py-8 mb-4 text-base mt-1.5 flex gap-2`.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/EmptyState.tsx
git commit -m "feat(ui): compact EmptyState from 360px to inline pills"
```

---

### Task 3: Reorder App.tsx, dedup header, delete FormatPicker

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/FormatPicker.tsx`

**Interfaces:**
- Consumes: UrlInput now self-contained (no FormatPicker import needed)
- Produces: App renders UrlInput → Probe/Empty → WaveformProgress → Metadata → Logs; header shows single queue badge

- [ ] **Step 1: Edit App.tsx — remove FormatPicker, fix header, reorder**

Changes to `src/App.tsx`:

1. Remove: `import { FormatPicker } from "./components/FormatPicker";`
2. Remove: `<FormatPicker />` line (was between probe section and WaveformProgress)
3. Header: replace two tags (`activeCount` + `queuedCount`) with single badge:
   ```tsx
   const totalQueued = queue.length; // or queue.filter(q/d) if want downloading+queued only
   // Replace both {activeCount>0 && <span tag-downloading>} and {queuedCount>0 && <span tag-queued>}
   // With:
   {totalQueued > 0 && <span className="tag tag-downloading">{totalQueued} in queue</span>}
   ```
   Keep `selectedMode` tag and engine dot. Keep drawer button.
4. Ensure order in main column is: `<UrlInput />` → probe/empty div → `<WaveformProgress />` → `<MetadataPanel />` → `<LogPanel />` (no FormatPicker between).

- [ ] **Step 2: Delete FormatPicker.tsx**

```bash
git rm src/components/FormatPicker.tsx
```

If any other file imports from FormatPicker, update it (grep first: `grep -r "FormatPicker" src/`).

- [ ] **Step 3: Verify build and grep**

Run:
```bash
npm run build
grep -r "FormatPicker" src/  # should return 0 results
```
Expected: build PASS, grep empty.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/FormatPicker.tsx
git commit -m "feat(ui): reorder App layout, dedup header badge, remove FormatPicker"
```

---

### Task 4: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full build + smoke**

Run:
```bash
npm run build
# Optional if server running:
npm run test:smoke
```
Expected: build PASS, smoke PASS (or skip if no server).

- [ ] **Step 2: Manual visual check (if dev server available)**

```bash
npm run dev  # or npm run server + open http://127.0.0.1:3000
```

Check:
- URL input + mode toggle + format/quality selects in one card
- Probe = ghost, Add = filled amber/cyan
- Queue summary appears when queue non-empty
- ProbeCard still renders correctly below UrlInput
- EmptyState compact
- Header single queue badge
- Drawer still opens, tabs work
- WaveformProgress unchanged

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review

- **Spec coverage:** All spec sections mapped — layout reorder (Task 3), UrlInput inline controls + queue summary (Task 1), EmptyState compact (Task 2), header dedup (Task 3), no store/API change (all tasks), build verification (Task 4).
- **Placeholder scan:** No TBD/TODO; all arrays and class names specified verbatim.
- **Type consistency:** Store selectors `selectedMode`, `selectedFormat`, `selectedQuality`, `setSelectedMode`, `setSelectedFormat`, `setSelectedQuality`, `queue` match existing Zustand store; queue item `status` values `downloading`/`queued` match types.
