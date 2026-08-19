# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish "The Capture Deck" UI with hardware toggle switches, inset rack styling, tabular monospace metrics, and enhanced slide-over queue/history drawer.

**Architecture:** Frontend CSS and React component adjustments in Tailwind v4 (`src/styles.css`, `src/components/...`).

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand.

## Global Constraints
- Minimal additions, leverage Tailwind v4 tokens and existing components.
- Zero new external dependencies.

---

## File Structure

- Modify: `src/styles.css` (Hardware rack inset styles, toggle switch styles, tabular numbers, pulsing REC glow)
- Modify: `src/components/Sidebar.tsx` or `src/components/Layout.tsx` (Queue/history slide-over drawer)
- Modify: `src/components/FormatPicker.tsx` (Analog rocker toggle for Audio/Video mode)
- Modify: `src/components/WaveformProgress.tsx` (Enhanced LED progress ring & reactive waveform)

---

### Task 1: Hardware Rack Styling & Tabular Monospace Metrics

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add tabular numeric utility and hardware rack panel styling**

Add custom CSS classes in `src/styles.css`:
```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
.rack-panel {
  background: linear-gradient(145deg, #0d0e14 0%, #06070a 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add rack panel styling and tabular numerals"
```

---

### Task 2: Analog Rocker Mode Toggle

**Files:**
- Modify: `src/components/FormatPicker.tsx`

- [ ] **Step 1: Style mode buttons as an analog rocker switch**

Update mode selection in `FormatPicker.tsx` with physical toggle styling.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FormatPicker.tsx
git commit -m "feat: style mode selector as hardware rocker toggle"
```

---

### Task 3: Pulsing REC Indicator & Waveform Polish

**Files:**
- Modify: `src/components/WaveformProgress.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Enhance REC glow and waveform animation**

Add glowing LED ring keyframe and polished waveform container in `styles.css` and `WaveformProgress.tsx`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/components/WaveformProgress.tsx
git commit -m "feat: enhance REC indicator and waveform feedback"
```

---

### Task 4: Queue & History Slide-Over Drawer

**Files:**
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Implement slide-over drawer for active downloads and history**

Connect sidebar buttons ("Downloads", "History") to toggle a slide-over overlay panel.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout.tsx src/components/Sidebar.tsx
git commit -m "feat: add slide-over drawer for queue and history"
```
