import type { Coordinate, RouteResponse } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { fetchRoute } from './route-api';

export type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; route: RouteResponse }
  | { status: 'error'; message: string };

export function useRoute(pickup: Coordinate | null, dropoff: Coordinate | null): { state: RouteState; retry(): void } {
  const [state, setState] = useState<RouteState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchRoute(pickup, dropoff, controller.signal)
      .then((route) => setState({ status: 'ready', route }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The route could not be loaded. Please try again.' });
      });
    return () => controller.abort();
  }, [pickup, dropoff, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
