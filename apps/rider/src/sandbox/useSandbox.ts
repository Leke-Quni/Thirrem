import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { openSandbox } from './sandbox-api';
import { movedAway } from './sandbox-centre';
import { browserSocket, liveUrl, watchDrivers } from './sandbox-live';

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; drivers: SimulatedDriver[]; connection: 'live' | 'reconnecting' | 'stopped' | 'discarded' | 'resuming' }
  | { status: 'error'; message: string };

export const hasTimedOut = (state: SandboxState) => state.status === 'ready' && (state.connection === 'stopped' || state.connection === 'discarded');

/** The Rider's Sandbox around `centre`. A timed out one comes back when asked to, or when a pin changes. */
export function useSandbox(centre: Coordinate | null, pickup: Coordinate | null, dropoff: Coordinate | null): { state: SandboxState; retry(): void; startNew(): void } {
  const [placedAt, setPlacedAt] = useState<Coordinate | null>(null);
  const [state, setState] = useState<SandboxState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Kept until a new Sandbox arrives, so trying again after a failure still asks for one.
  const wantsNew = useRef(false);

  useEffect(() => {
    if (centre && (!placedAt || movedAway(placedAt, centre))) setPlacedAt(centre);
  }, [centre, placedAt]);

  useEffect(() => {
    if (!placedAt) return;
    const controller = new AbortController();
    // A resuming Sandbox keeps its cars on the map, as they carry on from where they are.
    setState((current) => (!wantsNew.current && current.status === 'ready' && current.connection === 'stopped' ? { ...current, connection: 'resuming' } : { status: 'loading' }));
    const connected = (connection: 'reconnecting' | 'stopped' | 'discarded') => setState((current) => (current.status === 'ready' ? { ...current, connection } : current));
    let stopWatching: (() => void) | undefined;
    openSandbox(placedAt, wantsNew.current, controller.signal)
      .then(({ drivers }) => {
        if (controller.signal.aborted) return;
        wantsNew.current = false;
        setState({ status: 'ready', drivers, connection: 'live' });
        stopWatching = watchDrivers({
          token: localStorage.getItem(TOKEN_KEY) ?? '',
          connect: () => browserSocket(liveUrl(API_BASE_URL, window.location.href)),
          onDrivers: (live) => setState({ status: 'ready', drivers: live, connection: 'live' }),
          onLost: () => connected('reconnecting'),
          onGone: () => setAttempt((n) => n + 1),
          onStopped: () => connected('stopped'),
          onDiscarded: () => connected('discarded'),
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

  const startNew = useCallback(() => {
    wantsNew.current = true;
    retry();
  }, [retry]);

  const timedOut = useRef(false);
  timedOut.current = hasTimedOut(state);
  useEffect(() => {
    if (timedOut.current) retry();
  }, [pickup, dropoff, retry]);
  return { state, retry, startNew };
}
