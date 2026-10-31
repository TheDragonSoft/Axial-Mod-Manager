# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2026-09-20 - Accessible Slide-Over Drawers and Overlay Stacking
**Learning:** Slide-over drawer panels that remain mounted offscreen for animation performance must use `aria-hidden={!isOpen}` alongside `role="dialog"` so screen readers ignore them when hidden. Registering with `overlayStack` enables consistent Escape key handling and proper focus capture/restoration across layered UI components.
**Action:** For persistent offscreen drawer panels, always add `role="dialog"`, `aria-modal="true"`, and `aria-hidden={!isOpen}`, while integrating with `pushOverlay`/`popOverlay` to handle Escape dismissal and focus restore.
