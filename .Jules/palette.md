# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Slide-over Drawers
**Learning:** Slide-over drawers acting as modal panels must register with `overlayStack` (`pushOverlay`, `popOverlay`) and manage focus/aria states dynamically (`aria-hidden={!isOpen}`, `aria-modal={isOpen}`) so keypresses like Escape work seamlessly when stacked and focus traps properly.
**Action:** When converting drawers or side panels into modal dialogs, use `overlayStack` alongside a ref-based focus trap and conditional `aria-hidden` attributes.
