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
 * Uses `indexOf` and `slice` to parse version segments on the fly without
 * creating intermediate arrays via `.split('.')` and `.map()`.
 */
export function compareVersions(a: string, b: string): number {
  let startA = 0;
  let startB = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (startA < lenA || startB < lenB) {
    let endA = a.indexOf(".", startA);
    if (endA === -1) endA = lenA;
    const numA = parseInt(a.slice(startA, endA), 10) || 0;

    let endB = b.indexOf(".", startB);
    if (endB === -1) endB = lenB;
    const numB = parseInt(b.slice(startB, endB), 10) || 0;

    if (numA !== numB) return numA - numB;

    startA = endA + 1;
    startB = endB + 1;
  }

  return 0;
}
