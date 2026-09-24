# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Overlay Stack Integration for Slide-Over Drawers
**Learning:** Slide-over drawers (like QueueDrawer) should register with `overlayStack` alongside Modals and CommandPalette to ensure keyboard `Escape` dismissal operates predictably across overlapping overlay layers.
**Action:** When building non-modal drawer overlays, integrate `pushOverlay`/`popOverlay`, `isTopOverlay` check for Escape, focus restoration, and focus trap.
