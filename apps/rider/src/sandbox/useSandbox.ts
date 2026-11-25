import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { openSandbox } from './sandbox-api';
import { movedAway } from './sandbox-centre';
import { browserSocket, liveUrl, watchDrivers } from './sandbox-live';

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; drivers: SimulatedDriver[]; reconnecting: boolean }
  | { status: 'error'; message: string };

export function useSandbox(centre: Coordinate | null): { state: SandboxState; retry(): void } {
  const [placedAt, setPlacedAt] = useState<Coordinate | null>(null);
  const [state, setState] = useState<SandboxState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (centre && (!placedAt || movedAway(placedAt, centre))) setPlacedAt(centre);
  }, [centre, placedAt]);

  useEffect(() => {
    if (!placedAt) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    let stopWatching: (() => void) | undefined;
    openSandbox(placedAt, controller.signal)
      .then(({ drivers }) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', drivers, reconnecting: false });
        stopWatching = watchDrivers({
          token: localStorage.getItem(TOKEN_KEY) ?? '',
          connect: () => browserSocket(liveUrl(API_BASE_URL, window.location.href)),
          onDrivers: (live) => setState({ status: 'ready', drivers: live, reconnecting: false }),
          onLost: () => setState((current) => (current.status === 'ready' ? { ...current, reconnecting: true } : current)),
          onGone: () => setAttempt((n) => n + 1),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The Drivers could not be placed. Please try again.' });
      });
    return () => {
      controller.abort();
      stopWatching?.();
    };
  }, [placedAt, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
