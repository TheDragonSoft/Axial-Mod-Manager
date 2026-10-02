# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Integrating Drawer Overlays with Shared OverlayStack
**Learning:** Custom drawer or popover overlays that don't use the primary `Modal` wrapper should register with `overlayStack` (`pushOverlay`/`popOverlay`) and listen to the `Escape` key so layered overlays dismiss in exact reverse order of opening.
**Action:** When building custom overlay components (drawers, popovers, slide-outs), generate a component-scoped `Symbol` token, register it with `pushOverlay`/`popOverlay`, and verify `isTopOverlay(token)` on keydown before handling `Escape` dismissals.
