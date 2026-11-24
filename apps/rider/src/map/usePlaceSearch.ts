import type { Coordinate, PlaceResult } from '@thirrem/types';
import { useEffect, useState } from 'react';
import { searchPlaces } from './place-api';

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; places: PlaceResult[] }
  | { status: 'error'; message: string };

const MIN_CHARACTERS = 3;
const DEBOUNCE_MS = 350;

export function usePlaceSearch(query: string, near: Coordinate | null): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ status: 'idle' });
  const text = query.trim();
  const nearLat = near?.lat;
  const nearLon = near?.lon;

  useEffect(() => {
    if (text.length < MIN_CHARACTERS) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      searchPlaces(text, nearLat === undefined || nearLon === undefined ? null : { lat: nearLat, lon: nearLon }, controller.signal)
        .then((places) => setState({ status: 'ready', places }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Search is unavailable right now. Click the map to place a pin instead.' });
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, nearLat, nearLon]);

  return state;
}
