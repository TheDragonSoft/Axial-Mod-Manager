import { useEffect } from "react";
import { getModDetails } from "./api";
import { useThumbnailStore } from "../store/useThumbnailStore";

const inFlight = new Set<string>();

/**
 * Pulls portal thumbnails for the given mod names into the shared cache.
 * Each name resolves once per session via the existing details command
 * (backend dedupes/caches the HTTP itself); results arrive progressively.
 * Failures resolve to null so cards keep their letter tiles instead of
 * retrying forever.
 */
export function useThumbnails(names: string[]): void {
  // Stable effect key: callers pass fresh arrays every render.
  const namesKey = names.join("|");

  useEffect(() => {
    const list = namesKey ? namesKey.split("|") : [];
    // Read state imperatively via getState() instead of subscribing via selector.
    // This prevents parent pages (BrowsePage, InstalledPage) from re-rendering
    // N times as individual thumbnail URLs resolve into the store.
    const { urls, setResolved } = useThumbnailStore.getState();
    const missing = [...new Set(list)].filter(
      (n) => urls[n] === undefined && !inFlight.has(n),
    );
    if (missing.length === 0) return;
    for (const name of missing) {
      inFlight.add(name);
      getModDetails(name)
        .then((d) => setResolved(name, d.thumbnail))
        .catch(() => setResolved(name, null))
        .finally(() => inFlight.delete(name));
    }
  }, [namesKey]);
}

/** Selector for a single mod's thumbnail (undefined = still unknown). */
export function useThumbnailUrl(
  name: string | undefined | null,
): string | null | undefined {
  return useThumbnailStore((s) => (name ? s.urls[name] : undefined));
}
