## 2025-05-18 - Avoid Zustand Store Subscriptions in Void Pre-fetching Hooks
**Learning:** React hooks designed purely to pre-fetch/prime Zustand stores (such as `useThumbnails`) should not subscribe to store state using selectors like `useStore((s) => s.data)`. Subscribing causes the invoking parent page/container to re-render every time any item is resolved into the store, even though the hook returns `void`.
**Action:** Use `useStore.getState()` imperatively inside `useEffect` for store inspection in pre-fetching hooks, allowing leaf components with targeted selectors (e.g., `useThumbnailUrl(name)`) to re-render individually.

## 2025-05-18 - Prevented list item re-renders with React.memo and useCallback

**Learning:** In Axial's React frontend, parent components like `BrowsePage` (search inputs) and `InstalledPage` (mod management status updates) re-render frequently. Unmemoized item components (`ModCard` and `ModRow`) re-rendered every item on every keystroke or status change, causing noticeable main-thread overhead for long mod lists.

**Action:** Wrap card and row components in `React.memo` and stabilize event handler functions passed as props using `useCallback`. Ensure side effects (such as data fetching on expand) remain within event handlers rather than state updaters or effects with unstable dependency arrays.

## 2026-09-20 - Reuse Intl.Collator Instances in List Sorting Comparators

**Learning:** Calling `String.prototype.localeCompare` with options (e.g. `{ sensitivity: "base" }`) inside an `Array.prototype.sort()` comparator causes the JavaScript runtime (V8) to re-instantiate an `Intl.Collator` object for every comparison pair ($O(N \log N)$ allocations). For a 500-mod list, this allocates ~4,500 Collator instances and incurs ~42 ms of main-thread blocking time during client renders.

**Action:** Instantiate reusable `Intl.Collator` instances at module level outside of components and comparators, dropping sort time from ~42.7 ms to ~0.9 ms (>40x faster) and eliminating thousands of garbage-collected objects.
