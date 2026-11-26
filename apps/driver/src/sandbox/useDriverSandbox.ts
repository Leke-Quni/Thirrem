import { ApiError, shouldEndSession } from '@thirrem/ui';
import type { DriverCar } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { locateCentre } from './locate-centre';
import { sandboxApi, SandboxBusyError } from './sandbox-api';

const POLL_MS = 5_000;

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; car: DriverCar; connection: 'running' | 'stopped' | 'resuming' }
  // `car` is that of a stopped Sandbox that could not be resumed yet.
  | { status: 'busy'; car: DriverCar | null; retrying: boolean }
  | { status: 'error'; message: string };

/** The Driver's Sandbox. It is opened as the page appears, and a stopped or refused one when asked to. */
export function useDriverSandbox() {
  const { retry: recheckSession } = useAuth();
  const [state, setState] = useState<SandboxState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;
    setState((current) => {
      // The busy message stays up while trying again, so its button keeps focus.
      if (current.status === 'busy') return { ...current, retrying: true };
      // A Sandbox being resumed, or replaced because it was gone, keeps its car on the map.
      if (current.status === 'ready') return current.connection === 'stopped' ? { ...current, connection: 'resuming' } : current;
      return { status: 'loading' };
    });

    // Reading does not count as activity, so watching leaves the Sandbox to stop in its own time.
    const watch = async () => {
      try {
        const { status, car } = await sandboxApi.read(signal);
        if (signal.aborted) return;
        setState({ status: 'ready', car, connection: status });
        if (status === 'stopped') return;
      } catch (error) {
        if (signal.aborted) return;
        if (shouldEndSession(error)) return recheckSession();
        if (error instanceof ApiError && error.status === 404) return setAttempt((n) => n + 1);
        // Anything else is tried again; the page keeps showing the last answer.
      }
      timer = window.setTimeout(watch, POLL_MS);
    };

    const open = async () => {
      try {
        const centre = await locateCentre();
        if (signal.aborted) return;
        const { car } = await sandboxApi.open(centre, signal);
        if (signal.aborted) return;
        setState({ status: 'ready', car, connection: 'running' });
        timer = window.setTimeout(watch, POLL_MS);
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof SandboxBusyError) {
          setState((current) => ({ status: 'busy', car: 'car' in current ? current.car : null, retrying: false }));
          return;
        }
        if (shouldEndSession(error)) recheckSession();
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Could not reach Thirrem. Check your connection and try again.' });
      }
    };
    void open();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [attempt, recheckSession]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
