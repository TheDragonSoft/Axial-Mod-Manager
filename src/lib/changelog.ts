import { getModChangelog } from "./api";
import { useChangelogStore } from "../store/useChangelogStore";
import type { ChangelogEntry } from "../types";

const inFlight = new Set<string>();

/**
 * Fetches a mod's portal changelog and caches the result per mod
 * (same pattern as lib/summaries.ts; the backend additionally caches the
 * HTTP fetch). Failures resolve to null so the UI shows a muted
 * "changelog unavailable" instead of retrying forever.
 */
export function fetchChangelog(name: string): void {
  const { changelogs, setResolved } = useChangelogStore.getState();
  if (changelogs[name] !== undefined || inFlight.has(name)) return;

  inFlight.add(name);
  getModChangelog(name)
    .then((entries) => setResolved(name, entries))
    .catch(() => setResolved(name, null))
    .finally(() => inFlight.delete(name));
}

/** Selector for a mod's cached changelog (undefined = not yet fetched). */
export function useChangelog(
  name: string | undefined | null,
): ChangelogEntry[] | null | undefined {
  return useChangelogStore((s) => (name ? s.changelogs[name] : undefined));
}
