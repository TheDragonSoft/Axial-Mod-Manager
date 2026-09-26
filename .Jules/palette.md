# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Drawer Overlays with Overlay Stack
**Learning:** Slide-out drawer overlays need to register with `overlayStack` (`pushOverlay`/`popOverlay`) and capture focus on open so `Escape` key close and focus restoration work consistently alongside standard modals.
**Action:** Whenever adding or modifying slide-out drawers or non-Modal overlays, hook into `overlayStack` and manage focus restoration to `previouslyFocused`.
