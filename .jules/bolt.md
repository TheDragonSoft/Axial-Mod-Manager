## 2025-05-18 - Memoizing Search Result Cards to Eliminate Unnecessary Re-renders

**Learning:** Unmemoized React grid item components (like `ModCard` in `BrowsePage`) cause every card in the grid to re-render on every keystroke in search inputs before debouncing completes. Wrapping cards in `memo` avoids redundant VDOM tree traversals when typing or toggling parent UI controls.

**Action:** Always wrap grid/list item components in `memo()` when parent components maintain frequent state updates (like typing handlers or toggle flags) that don't affect item props.
