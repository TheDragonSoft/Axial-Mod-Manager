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
 * Compare "1.2.10" vs "1.2.9" numerically per segment.
 * Single-pass index traversal without array allocations (`split`/`map`)
 * to eliminate GC overhead when sorting/filtering large mod release lists.
 */
export function compareVersions(a: string, b: string): number {
  let iA = 0;
  let iB = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (iA < lenA || iB < lenB) {
    let segA = 0;
    if (iA < lenA) {
      let nextA = a.indexOf(".", iA);
      if (nextA === -1) nextA = lenA;
      while (iA < nextA) {
        const code = a.charCodeAt(iA);
        if (code >= 48 && code <= 57) {
          segA = segA * 10 + (code - 48);
          iA++;
        } else {
          break;
        }
      }
      iA = nextA + 1;
    }

    let segB = 0;
    if (iB < lenB) {
      let nextB = b.indexOf(".", iB);
      if (nextB === -1) nextB = lenB;
      while (iB < nextB) {
        const code = b.charCodeAt(iB);
        if (code >= 48 && code <= 57) {
          segB = segB * 10 + (code - 48);
          iB++;
        } else {
          break;
        }
      }
      iB = nextB + 1;
    }

    if (segA !== segB) {
      return segA - segB;
    }
  }

  return 0;
}
