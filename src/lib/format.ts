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

/** Parse next numeric segment from version string starting at pos.index. */
function parseSegment(str: string, pos: { index: number }): number {
  const len = str.length;
  let i = pos.index;
  if (i >= len) return 0;
  let num = 0;
  while (i < len && str.charCodeAt(i) !== 46 /* '.' */) {
    const code = str.charCodeAt(i);
    if (code >= 48 && code <= 57 /* '0'-'9' */) {
      num = num * 10 + (code - 48);
    } else {
      // Skip non-numeric suffix within segment
      while (i < len && str.charCodeAt(i) !== 46) i++;
      break;
    }
    i++;
  }
  if (i < len && str.charCodeAt(i) === 46) i++;
  pos.index = i;
  return num;
}

/**
 * Compare "1.2.10" vs "1.2.9" numerically per segment. Good enough for mod versions.
 * Single-pass numerical segment parsing eliminates array split and map allocations.
 */
export function compareVersions(a: string, b: string): number {
  const posA = { index: 0 };
  const posB = { index: 0 };
  while (posA.index < a.length || posB.index < b.length) {
    const diff = parseSegment(a, posA) - parseSegment(b, posB);
    if (diff !== 0) return diff;
  }
  return 0;
}
