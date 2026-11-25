import type { Coordinate, FareQuote } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { fetchFare } from './fare-api';

export type FareState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; fares: FareQuote[] }
  | { status: 'error'; message: string };

export function useFareQuote(pickup: Coordinate | null, dropoff: Coordinate | null): { state: FareState; retry(): void } {
  const [state, setState] = useState<FareState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchFare(pickup, dropoff, controller.signal)
      .then(({ fares }) => setState({ status: 'ready', fares }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The Fares could not be loaded. Please try again.' });
      });
    return () => controller.abort();
  }, [pickup, dropoff, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
