# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Slide-over Drawers in Stacking Contexts
**Learning:** Slide-over drawers that remain mounted offscreen need `aria-hidden={!isOpen}` and `inert={!isOpen ? true : undefined}` so screen readers and Tab keys ignore them when closed, along with `role="dialog"`, `aria-modal="true"`, and focus capture/restoration registered to `overlayStack` for Escape dismissal.
**Action:** Whenever implementing slide-out panels, register them with the app's `overlayStack`, save and restore `activeElement`, and apply `inert`/`aria-hidden` when closed.
