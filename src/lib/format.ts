/** 1842000 -> "1.8M" */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** 1234567 -> "1.2 MB" */
export function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** Received/total -> 0..100, clamped, safe against divide-by-zero. */
export function percent(received: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((received / total) * 100));
}

// Bounded cache for parsed version segment arrays to eliminate string split
// and array map allocations when sorting or comparing versions repeatedly.
const parsedVersionCache = new Map<string, number[]>();
const MAX_PARSED_VERSION_CACHE_SIZE = 500;

function parseVersionSegments(version: string): number[] {
  let cached = parsedVersionCache.get(version);
  if (!cached) {
    cached = version.split(".").map((s) => parseInt(s, 10) || 0);
    // Maintain a bounded cache size to prevent unbounded memory growth.
    if (parsedVersionCache.size >= MAX_PARSED_VERSION_CACHE_SIZE) {
      const oldestKey = parsedVersionCache.keys().next().value;
      if (oldestKey !== undefined) {
        parsedVersionCache.delete(oldestKey);
      }
    }
    parsedVersionCache.set(version, cached);
  }
  return cached;
}

/**
 * Compare "1.2.10" vs "1.2.9" numerically per segment.
 * Optimized with identity check and memoized segment parsing to eliminate repeated allocations
 * during array sorts and list filtering.
 */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const pa = parseVersionSegments(a);
  const pb = parseVersionSegments(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
