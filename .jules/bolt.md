## 2025-05-18 - Avoid Zustand Store Subscriptions in Void Pre-fetching Hooks
**Learning:** React hooks designed purely to pre-fetch/prime Zustand stores (such as `useThumbnails`) should not subscribe to store state using selectors like `useStore((s) => s.data)`. Subscribing causes the invoking parent page/container to re-render every time any item is resolved into the store, even though the hook returns `void`.
**Action:** Use `useStore.getState()` imperatively inside `useEffect` for store inspection in pre-fetching hooks, allowing leaf components with targeted selectors (e.g., `useThumbnailUrl(name)`) to re-render individually.

## 2025-05-18 - Prevented list item re-renders with React.memo and useCallback

**Learning:** In Axial's React frontend, parent components like `BrowsePage` (search inputs) and `InstalledPage` (mod management status updates) re-render frequently. Unmemoized item components (`ModCard` and `ModRow`) re-rendered every item on every keystroke or status change, causing noticeable main-thread overhead for long mod lists.

**Action:** Wrap card and row components in `React.memo` and stabilize event handler functions passed as props using `useCallback`. Ensure side effects (such as data fetching on expand) remain within event handlers rather than state updaters or effects with unstable dependency arrays.

## 2026-10-01 - Module-level Intl.Collator Reuse & Zero-allocation Version Comparison
**Learning:** Calling `a.localeCompare(b, undefined, { sensitivity: "base" })` in array sorting comparators instantiates a new `Intl.Collator` and parses options on every single pairwise comparison, causing massive CPU and GC overhead (~50x slowdown on large mod lists). Similarly, parsing version strings via `.split(".").map(parseInt)` allocates multiple short-lived arrays per comparison.
**Action:** Reuse a module-scoped `Intl.Collator` instance (`collator.compare(a, b)`) for list sorting and parse dot-separated version strings iteratively in a single pass without intermediate array allocations.
