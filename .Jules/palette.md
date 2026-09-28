# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Accessible Sidebar Navigation and Quick Access Items
**Learning:** Navigational sidebars containing page tabs and active status items (e.g. mod packs) require `aria-current="page"` on active page tabs and `aria-current="true"` with dynamic `aria-label`s on active status items so screen readers clearly announce current pages and active item states.
**Action:** Always set `aria-current="page"` on active main nav links and `aria-current="true"` on active state items in sidebar quick access components.
