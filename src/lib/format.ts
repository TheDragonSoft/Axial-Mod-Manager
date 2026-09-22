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
 * Optimized to avoid string allocations (split), array allocations, and closure creation
 * per call by walking character codes directly, with an O(1) equality fast-path.
 */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;

  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let numA = 0;
    while (i < lenA && a[i] !== ".") {
      const code = a.charCodeAt(i);
      if (code >= 48 && code <= 57) {
        numA = numA * 10 + (code - 48);
      }
      i++;
    }
    if (i < lenA && a[i] === ".") i++;

    let numB = 0;
    while (j < lenB && b[j] !== ".") {
      const code = b.charCodeAt(j);
      if (code >= 48 && code <= 57) {
        numB = numB * 10 + (code - 48);
      }
      j++;
    }
    if (j < lenB && b[j] === ".") j++;

    if (numA !== numB) {
      return numA - numB;
    }
  }

  return 0;
}
