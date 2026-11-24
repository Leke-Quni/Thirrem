import type { Coordinate } from '@thirrem/types';
import { useEffect, useState } from 'react';
import type { StreetLookup } from './pin-text';
import { fetchStreet } from './street-api';

const DEBOUNCE_MS = 400;

export function useStreetName(point: (Coordinate & { label?: string }) | null): StreetLookup {
  const [found, setFound] = useState<{ key: string; street: string | null } | null>(null);
  const key = point && !point.label ? `${point.lat.toFixed(5)},${point.lon.toFixed(5)}` : null;

  useEffect(() => {
    if (!key) return;
    const [lat, lon] = key.split(',').map(Number);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchStreet({ lat, lon }, controller.signal)
        .then((street) => setFound({ key, street }))
        .catch(() => {
          if (!controller.signal.aborted) setFound({ key, street: null });
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  if (!key) return { state: 'done', name: null };
  return found?.key === key ? { state: 'done', name: found.street } : { state: 'loading' };
}
