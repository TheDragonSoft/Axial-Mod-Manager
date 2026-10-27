# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Slide-over Drawers and Overlay Stack Registration
**Learning:** Slide-over drawer overlays that remain mounted in the DOM offscreen must set `aria-hidden={!isOpen}`, `role="dialog"`, `aria-modal="true"`, and register with `overlayStack` (`pushOverlay`/`popOverlay`) so assistive technologies ignore offscreen content and keyboard `Escape` press / focus focus/restoration works consistently across all overlay layers.
**Action:** Always include overlayStack registration, aria-hidden toggle, and focus restoration when building offscreen slide-over drawer components.
