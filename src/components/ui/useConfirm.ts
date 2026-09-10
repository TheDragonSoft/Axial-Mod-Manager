import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Two-step destructive confirm: `arm(id)` arms the confirmation for `id`;
 * it auto-disarms after `timeoutMs` so a second click within the window
 * confirms. Replaces the three hand-rolled copies.
 */
export function useConfirm(timeoutMs = 3000) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const disarm = useCallback(() => {
    setConfirming(null);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const arm = useCallback(
    (id: string) => {
      disarm();
      setConfirming(id);
      timer.current = window.setTimeout(() => setConfirming(null), timeoutMs);
    },
    [disarm, timeoutMs],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { confirming, arm, disarm };
}
