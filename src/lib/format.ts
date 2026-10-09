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

/**
 * Compare "1.2.10" vs "1.2.9" numerically per segment. Good enough for mod versions.
 * Optimized to parse numeric segments in a single pass without array allocations
 * (split/map), eliminating GC pressure during release and dependency list sorts.
 */
export function compareVersions(a: string, b: string): number {
  let ia = 0;
  let ib = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (ia < lenA || ib < lenB) {
    let numA = 0;
    while (ia < lenA && a.charCodeAt(ia) !== 46 /* '.' */) {
      const code = a.charCodeAt(ia);
      if (code >= 48 && code <= 57) {
        numA = numA * 10 + (code - 48);
      }
      ia++;
    }
    if (ia < lenA && a.charCodeAt(ia) === 46) {
      ia++;
    }

    let numB = 0;
    while (ib < lenB && b.charCodeAt(ib) !== 46 /* '.' */) {
      const code = b.charCodeAt(ib);
      if (code >= 48 && code <= 57) {
        numB = numB * 10 + (code - 48);
      }
      ib++;
    }
    if (ib < lenB && b.charCodeAt(ib) === 46) {
      ib++;
    }

    const diff = numA - numB;
    if (diff !== 0) return diff;
  }

  return 0;
}
