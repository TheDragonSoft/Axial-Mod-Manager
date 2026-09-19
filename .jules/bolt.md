## 2025-05-20 - Reuse Intl.Collator in sort comparators & microtask batch Zustand resolutions

**Learning:** Calling `String.prototype.localeCompare(other, undefined, { sensitivity: "base" })` inside an array sort comparator creates a new `Intl.Collator` instance on every pairwise comparison ($O(N \log N)$ allocations), causing severe execution lag during list sorting. Instantiating a single module-scoped `Intl.Collator` and calling `.compare()` is >50x faster. Additionally, when handling multiple asynchronous network resolutions, using `queueMicrotask` to batch updates into Zustand (`setManyResolved`) preserves progressive rendering while collapsing multiple store updates in the same tick into a single render.

**Action:** Always reuse module-level `Intl.Collator` instances for list sorting instead of passing options to `localeCompare` inside sort callbacks. When handling asynchronous batch responses, use `queueMicrotask` to batch store updates per event loop tick.
