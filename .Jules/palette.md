# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Drawer Overlay Stack Integration
**Learning:** Slide-over drawer panels (like `QueueDrawer`) that act as modal dialogs should register with the shared `overlayStack` (`pushOverlay`/`popOverlay`/`isTopOverlay`) so pressing Escape closes them predictably alongside standard modals.
**Action:** When building slide-over drawers or non-modal dialog overlays, wire up `overlayStack` for Escape handling, restore previous focus on close, and pair with `aria-expanded` + `aria-controls` on trigger controls.
