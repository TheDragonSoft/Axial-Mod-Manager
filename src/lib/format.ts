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

/** Parse a numeric version segment from str[start..end] without string splitting or allocations. */
function parseSegment(str: string, start: number, end: number): number {
  let num = 0;
  let hasDigit = false;
  for (let i = start; i < end; i++) {
    const code = str.charCodeAt(i);
    if (code >= 48 && code <= 57) { // '0'..'9'
      num = num * 10 + (code - 48);
      hasDigit = true;
    } else {
      break;
    }
  }
  return hasDigit ? num : 0;
}

/**
 * Compare "1.2.10" vs "1.2.9" numerically per segment.
 * Single-pass index traversal avoids array split and map allocations during list operations.
 */
export function compareVersions(a: string, b: string): number {
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;

  while (i < lenA || j < lenB) {
    let nextI = a.indexOf(".", i);
    if (nextI === -1) nextI = lenA;
    const numA = parseSegment(a, i, nextI);
    i = nextI + 1;

    let nextJ = b.indexOf(".", j);
    if (nextJ === -1) nextJ = lenB;
    const numB = parseSegment(b, j, nextJ);
    j = nextJ + 1;

    if (numA !== numB) return numA - numB;
  }
  return 0;
}
