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

// Module-level cache for parsed version segments to eliminate repetitive string
// splitting, array allocations, and integer parsing when sorting version lists.
const versionCache = new Map<string, number[]>();

function parseVersion(v: string): number[] {
  let parsed = versionCache.get(v);
  if (!parsed) {
    parsed = v.split(".").map((s) => parseInt(s, 10) || 0);
    versionCache.set(v, parsed);
  }
  return parsed;
}

/** Compare "1.2.10" vs "1.2.9" numerically per segment. Good enough for mod versions. */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
