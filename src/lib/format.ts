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
 *
 * Performance optimization: Single-pass numerical segment parsing using index pointers
 * eliminates all string `.split('.')` and array `.map()` allocations during sorting and filtering operations.
 */
export function compareVersions(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const nextI = a.indexOf(".", i);
    const nextJ = b.indexOf(".", j);
    const segA = parseInt(a.slice(i, nextI === -1 ? undefined : nextI), 10) || 0;
    const segB = parseInt(b.slice(j, nextJ === -1 ? undefined : nextJ), 10) || 0;
    if (segA !== segB) return segA - segB;
    i = nextI === -1 ? a.length : nextI + 1;
    j = nextJ === -1 ? b.length : nextJ + 1;
  }
  return 0;
}
