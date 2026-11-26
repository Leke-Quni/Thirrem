import type { UnpaidFare } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { unpaidFareApi } from './unpaid-fare-api';

/** The Fares the Rider still owes, asked for again whenever `occasion` changes. `error` says why they could not be had. */
export function useUnpaidFares(enabled: boolean, occasion = '') {
  const [fares, setFares] = useState<UnpaidFare[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    unpaidFareApi.list().then(
      (list) => {
        if (!current) return;
        setFares(list.fares);
        setError(null);
      },
      (failure: unknown) => current && setError(failure instanceof Error ? failure.message : 'Your unpaid Fares could not be checked.'),
    );
    return () => {
      current = false;
    };
  }, [enabled, occasion, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { fares, setFares, error, retry };
}
