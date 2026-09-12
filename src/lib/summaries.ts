import { getModDetails } from "./api";
import { useSummaryStore } from "../store/useSummaryStore";

const inFlight = new Set<string>();

/**
 * Fetches the portal summary for a single mod and caches the result.
 * Uses the existing details command (backend dedupes/caches the HTTP call).
 * Failures resolve to null so the UI shows "description unavailable" instead
 * of retrying forever.
 */
export function fetchSummary(name: string): void {
  const { summaries, setResolved } = useSummaryStore.getState();
  if (summaries[name] !== undefined || inFlight.has(name)) return;

  inFlight.add(name);
  getModDetails(name)
    .then((d) => setResolved(name, d.summary || null))
    .catch(() => setResolved(name, null))
    .finally(() => inFlight.delete(name));
}

/** Selector for a single mod's cached summary (undefined = not yet fetched). */
export function useSummary(
  name: string | undefined | null,
): string | null | undefined {
  return useSummaryStore((s) => (name ? s.summaries[name] : undefined));
}
