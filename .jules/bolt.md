## 2025-05-18 - Avoid Zustand Store Subscriptions in Void Pre-fetching Hooks
**Learning:** React hooks designed purely to pre-fetch/prime Zustand stores (such as `useThumbnails`) should not subscribe to store state using selectors like `useStore((s) => s.data)`. Subscribing causes the invoking parent page/container to re-render every time any item is resolved into the store, even though the hook returns `void`.
**Action:** Use `useStore.getState()` imperatively inside `useEffect` for store inspection in pre-fetching hooks, allowing leaf components with targeted selectors (e.g., `useThumbnailUrl(name)`) to re-render individually.

## 2025-05-18 - Prevented list item re-renders with React.memo and useCallback

**Learning:** In Axial's React frontend, parent components like `BrowsePage` (search inputs) and `InstalledPage` (mod management status updates) re-render frequently. Unmemoized item components (`ModCard` and `ModRow`) re-rendered every item on every keystroke or status change, causing noticeable main-thread overhead for long mod lists.

**Action:** Wrap card and row components in `React.memo` and stabilize event handler functions passed as props using `useCallback`. Ensure side effects (such as data fetching on expand) remain within event handlers rather than state updaters or effects with unstable dependency arrays.

## 2025-05-18 - Reuse Module-Level Intl.Collator for List Sorting

**Learning:** Invoking `String.prototype.localeCompare(other, undefined, { sensitivity: "base" })` repeatedly inside an array sort comparator causes JavaScript engines (V8, WebKit) to instantiate or configure an `Intl.Collator` instance on every comparison. In list views sorting 100+ items across frequent state updates or rescans, this incurs substantial CPU and GC overhead.
**Action:** Instantiate `Intl.Collator` instances at module scope (e.g. `const baseCollator = new Intl.Collator(undefined, { sensitivity: "base" });`) and call `.compare(a, b)` inside the sort comparator.
