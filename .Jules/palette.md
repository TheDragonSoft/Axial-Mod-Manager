# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Standardizing Drawer Overlays with Overlay Stack & Focus Restoration
**Learning:** Slide-over panels or drawers (like `QueueDrawer`) that act as modal overlays need to register with `overlayStack` (`pushOverlay`, `popOverlay`) and capture `document.activeElement` to restore focus on close and handle `Escape` properly.
**Action:** Always include `role="dialog"`, `aria-modal="true"`, `aria-hidden={!open}`, and `overlayStack` handlers on drawer components to ensure consistent keyboard and screen reader accessibility.
