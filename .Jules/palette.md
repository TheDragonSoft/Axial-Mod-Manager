# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Synchronizing Drawer Overlays with OverlayStack
**Learning:** Drawer panels (`aside` overlays) should register with `pushOverlay` / `popOverlay` in `overlayStack` so pressing `Escape` closes the topmost active overlay in sequence (whether a modal, command palette, or side drawer) and restores focus to the triggering element.
**Action:** When creating side drawers or non-modal dialog overlays, add `overlayStack` registration, `Escape` key listeners, and focus restoration to match `Modal.tsx`.
