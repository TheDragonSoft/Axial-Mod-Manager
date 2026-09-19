import { useEffect } from "react";
import { getModDetails } from "./api";
import { useThumbnailStore } from "../store/useThumbnailStore";

const inFlight = new Set<string>();

let pendingBatch: Record<string, string | null> = {};
let microtaskScheduled = false;

function scheduleResolution(name: string, url: string | null) {
  pendingBatch[name] = url;
  if (!microtaskScheduled) {
    microtaskScheduled = true;
    queueMicrotask(() => {
      const batch = pendingBatch;
      pendingBatch = {};
      microtaskScheduled = false;
      useThumbnailStore.getState().setManyResolved(batch);
    });
  }
}

/**
 * Pulls portal thumbnails for the given mod names into the shared cache.
 * Each name resolves once per session via the existing details command
 * (backend dedupes/caches the HTTP itself). Responses are batched per
 * microtask tick via `queueMicrotask` to preserve progressive rendering
 * without triggering redundant re-renders when multiple responses settle
 * together in the same tick.
 * Failures resolve to null so cards keep their letter tiles instead of
 * retrying forever.
 */
export function useThumbnails(names: string[]): void {
  const urls = useThumbnailStore((s) => s.urls);
  // Stable effect key: callers pass fresh arrays every render.
  const namesKey = names.join("|");

  useEffect(() => {
    const list = namesKey ? namesKey.split("|") : [];
    const missing = [...new Set(list)].filter(
      (n) => urls[n] === undefined && !inFlight.has(n),
    );
    if (missing.length === 0) return;

    for (const name of missing) {
      inFlight.add(name);
      getModDetails(name)
        .then((d) => scheduleResolution(name, d.thumbnail))
        .catch(() => scheduleResolution(name, null))
        .finally(() => inFlight.delete(name));
    }
  }, [namesKey, urls]);
}

/** Selector for a single mod's thumbnail (undefined = still unknown). */
export function useThumbnailUrl(
  name: string | undefined | null,
): string | null | undefined {
  return useThumbnailStore((s) => (name ? s.urls[name] : undefined));
}
