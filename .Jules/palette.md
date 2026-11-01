# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Modal Drawer Accessibility & Overlay Stack Integration
**Learning:** Offscreen slide-over drawers that remain mounted in the DOM must combine `aria-hidden={!isOpen}` with `role="dialog"` to prevent screen readers from discovering inactive elements, and integrate with `overlayStack` to support Escape-to-close and focus restoration.
**Action:** When creating drawer/sheet overlays that animate off-canvas instead of unmounting, always manage `aria-hidden`, register a token with `overlayStack`, and restore focus to the triggering element on close.
