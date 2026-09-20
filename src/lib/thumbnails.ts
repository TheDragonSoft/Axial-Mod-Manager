import { useEffect } from "react";
import { getBulkModDetails } from "./api";
import { useThumbnailStore } from "../store/useThumbnailStore";

const inFlight = new Set<string>();

/**
 * Pulls portal thumbnails for the given mod names into the shared cache.
 * Each name resolves once per session via a single bulk details command
 * (backend dedupes/caches the HTTP itself); results arrive in batches.
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
    // as thumbnail URLs resolve into the store.
    const { urls, setResolved } = useThumbnailStore.getState();
    const missing = [...new Set(list)].filter(
      (n) => urls[n] === undefined && !inFlight.has(n),
    );
    if (missing.length === 0) return;
    for (const name of missing) {
      inFlight.add(name);
    }
    getBulkModDetails(missing)
      .then((detailsList) => {
        const found = new Set<string>();
        for (const d of detailsList) {
          found.add(d.name);
          setResolved(d.name, d.thumbnail);
        }
        for (const name of missing) {
          if (!found.has(name)) {
            setResolved(name, null);
          }
        }
      })
      .catch(() => {
        for (const name of missing) {
          setResolved(name, null);
        }
      })
      .finally(() => {
        for (const name of missing) {
          inFlight.delete(name);
        }
      });
  }, [namesKey]);
}

/** Selector for a single mod's thumbnail (undefined = still unknown). */
export function useThumbnailUrl(
  name: string | undefined | null,
): string | null | undefined {
  return useThumbnailStore((s) => (name ? s.urls[name] : undefined));
}
