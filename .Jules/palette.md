# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Slide-over Drawers
**Learning:** Slide-over drawers (`aside` elements animated with `translate-x-full`) remain in the DOM when closed, requiring `aria-hidden={!isOpen}`, `pointer-events-none`, and `aria-modal={isOpen}` to prevent screen readers and pointer interaction with offscreen content.
**Action:** When creating slide-over drawer components, pair offscreen translation with `aria-hidden`, `pointer-events-none`, `overlayStack` registration, and focus management (focus on open, restore on close).
