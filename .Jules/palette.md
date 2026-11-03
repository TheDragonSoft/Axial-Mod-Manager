# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2026-03-31 - Accessible Slide-Over Drawers with Overlay Stack
**Learning:** Slide-over drawers that remain mounted offscreen need both dialog semantics (`role="dialog"`, `aria-modal="true"`) and concealment when closed (`aria-hidden={!isOpen}`, `inert={!isOpen ? true : undefined}`) to prevent offscreen interactive elements from intercepting keyboard navigation. Integrating drawers into a shared `overlayStack` provides seamless Escape-to-close behavior across nested overlays along with focus restoration.
**Action:** When implementing slide-out panels or off-canvas drawers, register them with `overlayStack` on open, focus the primary dismiss action, and apply `inert`/`aria-hidden` when closed.
