# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-22 - Drawer Overlay Stack Integration & Focus Trap
**Learning:** Slide-over drawer panels (like the Downloads queue) act as modal overlays and must register with `overlayStack` (`pushOverlay`/`popOverlay`/`isTopOverlay`) to support closing with Escape key and focus trap/restoration.
**Action:** Always wrap full-height drawer components in `overlayStack` listeners and tab focus traps to maintain consistent keyboard navigation across all overlay components in the app.
