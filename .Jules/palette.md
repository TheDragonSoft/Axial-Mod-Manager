# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible CSS-Translated Slide-Over Drawers
**Learning:** Drawer components that remain mounted in the DOM while offscreen (e.g. via `translate-x-full`) must set `aria-hidden={!isOpen}` alongside `role="dialog"`, `aria-modal="true"`, and `overlayStack` registration so screen readers correctly ignore the offscreen panel when closed.
**Action:** Always include `aria-hidden={!isOpen}` on slide-over drawer containers that stay mounted while closed.
