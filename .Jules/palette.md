# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Preserving Input Focus on Clear Button Click
**Learning:** Adding `onMouseDown={(e) => e.preventDefault()}` to clear buttons inside text inputs prevents mouse clicks from blurring the input element, keeping keyboard focus directly inside the text field so typing can resume seamlessly.
**Action:** Always attach `onMouseDown={(e) => e.preventDefault()}` to icon buttons nested inside text controls that act as text modifiers.
