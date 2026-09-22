## 2025-05-18 - Avoid Zustand Store Subscriptions in Void Pre-fetching Hooks
**Learning:** React hooks designed purely to pre-fetch/prime Zustand stores (such as `useThumbnails`) should not subscribe to store state using selectors like `useStore((s) => s.data)`. Subscribing causes the invoking parent page/container to re-render every time any item is resolved into the store, even though the hook returns `void`.
**Action:** Use `useStore.getState()` imperatively inside `useEffect` for store inspection in pre-fetching hooks, allowing leaf components with targeted selectors (e.g., `useThumbnailUrl(name)`) to re-render individually.

## 2025-05-18 - Prevented list item re-renders with React.memo and useCallback

**Learning:** In Axial's React frontend, parent components like `BrowsePage` (search inputs) and `InstalledPage` (mod management status updates) re-render frequently. Unmemoized item components (`ModCard` and `ModRow`) re-rendered every item on every keystroke or status change, causing noticeable main-thread overhead for long mod lists.

**Action:** Wrap card and row components in `React.memo` and stabilize event handler functions passed as props using `useCallback`. Ensure side effects (such as data fetching on expand) remain within event handlers rather than state updaters or effects with unstable dependency arrays.

## 2025-05-18 - Memoize Version String Parsing in Comparators

**Learning:** Version comparison helper `compareVersions(a, b)` used across modal releases sorting and changelog filtering repeatedly called `.split('.')` and `.map(parseInt)`. For array sorting with ~100 release items (doing ~700 pair comparisons), this caused over 1,400 string splits and array allocations on every sort invocation.

**Action:** Add an identity check (`a === b`) for instant equality returns, and memoize version string parsing (`parseVersion`) using a module-level `Map` cache (with size cap to prevent unbounded growth).
