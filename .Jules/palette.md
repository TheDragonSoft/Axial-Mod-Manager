# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Drawer Panel Accessibility & Overlay Stack
**Learning:** Slide-over drawer overlays that act as modal panels must register with `overlayStack` (`pushOverlay`/`popOverlay`), trap Tab focus, focus on mount, restore previous focus on close, and handle Escape key presses to maintain accessible overlay hierarchy.
**Action:** Always hook drawer overlay components into `overlayStack` and include a focus trap `useEffect` when creating slide-over overlays.
