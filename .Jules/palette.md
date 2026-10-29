# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Slide-over Drawer Overlays
**Learning:** Offscreen slide-over drawers that remain mounted in the DOM must set `aria-hidden={!isOpen}` alongside `role="dialog"` and `aria-modal="true"`. To prevent keyboard trapping, they should also register with `overlayStack` (`pushOverlay`/`popOverlay`) to support `Escape` key closing and focus trap/restoration upon toggling.
**Action:** Always integrate slide-over drawer overlays with `overlayStack` and manage focus and ARIA visibility attributes when open or closed.
