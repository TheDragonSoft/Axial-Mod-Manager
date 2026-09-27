# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Progress Bar Attributes
**Learning:** Progress indicator components built with simple styled `div` elements are invisible to assistive technology unless decorated with `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and an explicit `aria-label`.
**Action:** Always include integer `aria-valuenow` and descriptive `label` props on visual progress components so screen reader users receive progress updates during asynchronous operations like downloads and updates.
