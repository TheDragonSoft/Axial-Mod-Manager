# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Overlay Stack Integration for Side Drawers
**Learning:** Non-modal slide-over drawers (e.g. QueueDrawer) should integrate with the shared `overlayStack` pattern alongside modals and command palettes to maintain predictable Escape key dismiss order and focus restoration across layered UI states.
**Action:** Always register slide-out drawers in `overlayStack` and add `role="dialog"`, `aria-modal`, and auto-focus management when `isOpen` is toggled.
