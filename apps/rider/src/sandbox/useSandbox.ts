import type { Coordinate, Ride, RideRequest, SandboxResponse, SimulatedDriver } from '@thirrem/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { openSandbox, SandboxBusyError } from './sandbox-api';
import { movedAway } from './sandbox-centre';
import { browserSocket, liveUrl, watchDrivers } from './sandbox-live';

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; drivers: SimulatedDriver[]; rideRequest: RideRequest | null; ride: Ride | null; requestsPausedForS: number | null; cancelWarningAtMs: number | null; connection: 'live' | 'reconnecting' | 'stopped' | 'discarded' | 'resuming' }
  // `drivers` are those of a stopped Sandbox that could not be continued yet.
  | { status: 'busy'; drivers: SimulatedDriver[]; retrying: boolean }
  | { status: 'error'; message: string };

/** How long the API pauses Ride Requests for, shown until the live feed says how long is left. */
const PAUSE_S = 15 * 60;

const running = (sandbox: SandboxResponse): SandboxState => ({ status: 'ready', ...sandbox, connection: 'live' });

export const hasTimedOut = (state: SandboxState) => state.status === 'ready' && (state.connection === 'stopped' || state.connection === 'discarded');

/** The Rider's Sandbox around `centre`. A timed out or refused one is opened when asked to, or when a pin changes. */
export function useSandbox(
  centre: Coordinate | null,
  pickup: Coordinate | null,
  dropoff: Coordinate | null,
): { state: SandboxState; retry(): void; startNew(): void; requested(rideRequest: RideRequest): void; cancelled(paused: boolean): void; routing(): void } {
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
      if (!wantsNew.current && current.status === 'ready') {
        if (current.connection === 'stopped') return { ...current, connection: 'resuming' };
        // An open Ride Request or a Ride keeps the Sandbox wherever its centre moves, so it stays on screen.
        if (current.ride || (current.rideRequest && current.rideRequest.status !== 'failed')) return current;
      }
      return { status: 'loading' };
    });
    const connected = (connection: 'reconnecting' | 'stopped' | 'discarded') => setState((current) => (current.status === 'ready' ? { ...current, connection } : current));
    let stopWatching: (() => void) | undefined;
    openSandbox(placedAt, wantsNew.current, controller.signal)
      .then((sandbox) => {
        if (controller.signal.aborted) return;
        wantsNew.current = false;
        setState(running(sandbox));
        stopWatching = watchDrivers({
          token: localStorage.getItem(TOKEN_KEY) ?? '',
          connect: () => browserSocket(liveUrl(API_BASE_URL, window.location.href)),
          onSandbox: (live) => setState(running(live)),
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

  /** Shows a Ride Request just made, without waiting for the live feed to report it. */
  const requested = useCallback((rideRequest: RideRequest) => setState((current) => (current.status === 'ready' ? { ...current, rideRequest } : current)), []);

  /** Takes a cancelled Ride Request off the screen, ahead of the live feed. */
  const cancelled = useCallback(
    (paused: boolean) =>
      setState((current) => (current.status === 'ready' ? { ...current, rideRequest: null, requestsPausedForS: paused ? PAUSE_S : current.requestsPausedForS } : current)),
    [],
  );

  /** Shows that the route of the Ride, or of the Driver on the way to pickup, is being looked for again, ahead of the live feed. */
  const routing = useCallback(
    () =>
      setState((current) => {
        if (current.status !== 'ready') return current;
        const { ride, rideRequest } = current;
        if (ride) return { ...current, ride: { ...ride, progress: { status: 'routing' } } };
        return rideRequest ? { ...current, rideRequest: { ...rideRequest, approach: { status: 'routing' } } } : current;
      }),
    [],
  );

  // A pin change is the Rider coming back, so it opens a Sandbox that is not running.
  const notRunning = useRef(false);
  notRunning.current = hasTimedOut(state) || state.status === 'busy';
  useEffect(() => {
    if (notRunning.current) retry();
  }, [pickup, dropoff, retry]);
  return { state, retry, startNew, requested, cancelled, routing };
}
