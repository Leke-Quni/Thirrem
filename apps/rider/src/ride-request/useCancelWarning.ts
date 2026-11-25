import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether to show the warning that more cancelling will pause Ride Requests: only when `warningAtMs` changes while the page is open, so a reload does not bring it back.
 * It is undefined until the Sandbox has said.
 */
export function useCancelWarning(warningAtMs: number | null | undefined, paused: boolean) {
  const seen = useRef<number | null | undefined>(undefined);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (warningAtMs === undefined) return;
    if (seen.current !== undefined && warningAtMs !== null && warningAtMs !== seen.current) setShown(true);
    seen.current = warningAtMs;
  }, [warningAtMs]);

  // The pause has its own countdown, and the warning of it is past.
  useEffect(() => {
    if (paused) setShown(false);
  }, [paused]);

  const close = useCallback(() => setShown(false), []);
  return { shown, close };
}
