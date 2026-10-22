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

/** Compare "1.2.10" vs "1.2.9" numerically per segment. Good enough for mod versions. */
export function compareVersions(a: string, b: string): number {
  // Optimization: Single-pass numerical segment parsing eliminates array split and map allocations
  // during sorting and filtering operations, while allowing early exit on non-matching segments.
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let numA = 0;
    if (i < lenA) {
      let endA = a.indexOf(".", i);
      if (endA === -1) endA = lenA;
      numA = parseInt(a.slice(i, endA), 10) || 0;
      i = endA + 1;
    }

    let numB = 0;
    if (j < lenB) {
      let endB = b.indexOf(".", j);
      if (endB === -1) endB = lenB;
      numB = parseInt(b.slice(j, endB), 10) || 0;
      j = endB + 1;
    }

    const diff = numA - numB;
    if (diff !== 0) return diff;
  }

  return 0;
}
