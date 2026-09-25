# Palette's Journal - Critical Learnings

## 2025-05-20 - Accessible Clear Button for Search Inputs
**Learning:** Adding an `onClear` callback support to shared `Input` components allows easily embedding an accessible clear (`X`) button inside search inputs without breaking layout or padding.
**Action:** When creating reusable input primitives, build optional clear action slots with dynamic right padding (`pr-9`) and customizable `clearLabel` for screen readers.

## 2025-05-21 - Visual Discovery Trigger for Global Keyboard Shortcuts
**Learning:** Global keyboard overlays like Command Palettes are invisible to mouse/touch users and screen reader users unless exposed via a navigation/header trigger. Adding a navigation button with a custom event dispatch and an OS-aware shortcut badge (`⌘K`/`Ctrl+K`) improves discoverability while teaching users the shortcut.
**Action:** When adding global shortcut overlays, expose a navigation/toolbar button that dispatches a custom UI toggle event and displays an OS-aware `<kbd>` badge.
