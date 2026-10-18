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

/** Helper for single-pass integer parsing of version segments without string allocations. */
function parseSegmentInt(str: string, start: number, end: number): number {
  let idx = start;
  while (idx < end && str.charCodeAt(idx) === 32) idx++; // skip leading whitespace
  let hasDigits = false;
  let num = 0;
  while (idx < end) {
    const code = str.charCodeAt(idx);
    if (code >= 48 && code <= 57) { // '0'-'9'
      hasDigits = true;
      num = num * 10 + (code - 48);
      idx++;
    } else {
      break; // parseInt behavior: stop at non-digit
    }
  }
  return hasDigits ? num : 0;
}

/**
 * Compare "1.2.10" vs "1.2.9" numerically per segment.
 * Single-pass segment parsing eliminates string `.split()` and `.map()` array allocations.
 */
export function compareVersions(a: string, b: string): number {
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let nextI = a.indexOf(".", i);
    if (nextI === -1) nextI = lenA;
    const numA = parseSegmentInt(a, i, nextI);
    i = nextI < lenA ? nextI + 1 : lenA;

    let nextJ = b.indexOf(".", j);
    if (nextJ === -1) nextJ = lenB;
    const numB = parseSegmentInt(b, j, nextJ);
    j = nextJ < lenB ? nextJ + 1 : lenB;

    if (numA !== numB) return numA - numB;
  }
  return 0;
}
