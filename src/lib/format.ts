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

/** Compare "1.2.10" vs "1.2.9" numerically per segment. Good enough for mod versions.
 * Single-pass numerical parsing to eliminate string splitting and array allocations during sorting.
 */
export function compareVersions(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  let i = 0;
  let j = 0;

  while (i < lenA || j < lenB) {
    let numA = 0;
    let numB = 0;

    if (i < lenA) {
      let parsingDigits = true;
      while (i < lenA) {
        const code = a.charCodeAt(i);
        if (code === 46 /* '.' */) {
          i++;
          break;
        }
        if (parsingDigits && code >= 48 && code <= 57) {
          numA = numA * 10 + (code - 48);
        } else {
          parsingDigits = false;
        }
        i++;
      }
    }

    if (j < lenB) {
      let parsingDigits = true;
      while (j < lenB) {
        const code = b.charCodeAt(j);
        if (code === 46 /* '.' */) {
          j++;
          break;
        }
        if (parsingDigits && code >= 48 && code <= 57) {
          numB = numB * 10 + (code - 48);
        } else {
          parsingDigits = false;
        }
        j++;
      }
    }

    if (numA !== numB) {
      return numA - numB;
    }
  }

  return 0;
}
