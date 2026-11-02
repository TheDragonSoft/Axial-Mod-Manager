# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Persistent Slide-Over Drawers
**Learning:** Slide-over drawer overlays that stay permanently mounted in the DOM and animate off-screen via CSS transforms must set `aria-hidden={!isOpen}` and `inert={!isOpen ? true : undefined}` so screen readers and keyboard tab navigation ignore offscreen buttons when closed. Furthermore, registering them with the application's modal overlay stack ensures consistent Escape dismissal and proper focus capture/restoration.
**Action:** Always wire slide-over drawers with `role="dialog"`, `aria-modal="true"`, `aria-hidden`, `inert`, and the overlay stack when mounting persistently.

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.
