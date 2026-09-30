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
 *
 * Performance: Single-pass index-based segment parser with zero array or string allocations.
 * Replaces `.split(".")` and `.map(parseInt)` to eliminate GC overhead during frequent
 * version sorting (e.g., release lists, changelogs, dependency resolution).
 */
export function compareVersions(a: string, b: string): number {
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let valA = 0;
    let hasDigitsA = false;
    let parsingA = true;
    while (i < lenA) {
      const code = a.charCodeAt(i);
      i++;
      if (code === 46 /* '.' */) break;
      if (parsingA) {
        if (code >= 48 && code <= 57 /* '0'-'9' */) {
          valA = valA * 10 + (code - 48);
          hasDigitsA = true;
        } else {
          parsingA = false;
        }
      }
    }

    let valB = 0;
    let hasDigitsB = false;
    let parsingB = true;
    while (j < lenB) {
      const code = b.charCodeAt(j);
      j++;
      if (code === 46 /* '.' */) break;
      if (parsingB) {
        if (code >= 48 && code <= 57 /* '0'-'9' */) {
          valB = valB * 10 + (code - 48);
          hasDigitsB = true;
        } else {
          parsingB = false;
        }
      }
    }

    const numA = hasDigitsA ? valA : 0;
    const numB = hasDigitsB ? valB : 0;
    const diff = numA - numB;
    if (diff !== 0) return diff;
  }

  return 0;
}
