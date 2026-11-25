import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { openSandbox, SandboxBusyError } from './sandbox-api';
import { movedAway } from './sandbox-centre';
import { browserSocket, liveUrl, watchDrivers } from './sandbox-live';

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; drivers: SimulatedDriver[]; connection: 'live' | 'reconnecting' | 'stopped' | 'discarded' | 'resuming' }
  // `drivers` are those of a stopped Sandbox that could not be continued yet.
  | { status: 'busy'; drivers: SimulatedDriver[]; retrying: boolean }
  | { status: 'error'; message: string };

export const hasTimedOut = (state: SandboxState) => state.status === 'ready' && (state.connection === 'stopped' || state.connection === 'discarded');

/** The Rider's Sandbox around `centre`. A timed out or refused one is opened when asked to, or when a pin changes. */
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
    setState((current) => {
      // The busy message stays up while trying again, so its button keeps focus.
      if (current.status === 'busy') return { ...current, retrying: true };
      if (!wantsNew.current && current.status === 'ready' && current.connection === 'stopped') return { ...current, connection: 'resuming' };
      return { status: 'loading' };
    });
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
        if (error instanceof SandboxBusyError) {
          // A new Sandbox replaces the cars of the old one, so only a continued one keeps them.
          setState((current) => ({ status: 'busy', drivers: !wantsNew.current && 'drivers' in current ? current.drivers : [], retrying: false }));
          return;
        }
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

  // A pin change is the Rider coming back, so it opens a Sandbox that is not running.
  const notRunning = useRef(false);
  notRunning.current = hasTimedOut(state) || state.status === 'busy';
  useEffect(() => {
    if (notRunning.current) retry();
  }, [pickup, dropoff, retry]);
  return { state, retry, startNew };
}
