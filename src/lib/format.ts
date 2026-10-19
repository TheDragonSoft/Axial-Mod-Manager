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

/** Compare "1.2.10" vs "1.2.9" numerically per segment.
 * Single-pass numerical segment parser eliminates intermediate array split and map allocations
 * during list sorting operations.
 */
export function compareVersions(a: string, b: string): number {
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let numA = 0;
    let numB = 0;

    // Parse leading numeric digits in current segment of a (matches parseInt behavior)
    while (i < lenA && a[i] >= "0" && a[i] <= "9") {
      numA = numA * 10 + (a.charCodeAt(i) - 48);
      i++;
    }
    // Advance past any non-digit tail in segment a until '.'
    while (i < lenA && a[i] !== ".") {
      i++;
    }

    // Parse leading numeric digits in current segment of b (matches parseInt behavior)
    while (j < lenB && b[j] >= "0" && b[j] <= "9") {
      numB = numB * 10 + (b.charCodeAt(j) - 48);
      j++;
    }
    // Advance past any non-digit tail in segment b until '.'
    while (j < lenB && b[j] !== ".") {
      j++;
    }

    if (numA !== numB) {
      return numA - numB;
    }

    if (i < lenA) i++; // skip '.'
    if (j < lenB) j++; // skip '.'
  }

  return 0;
}
