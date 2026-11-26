import { DEFAULT_VIEW } from '@thirrem/map';
import type { Coordinate } from '@thirrem/types';

const ANSWER_TIMEOUT_MS = 10_000;
const [lon, lat] = DEFAULT_VIEW.center;
const FALLBACK: Coordinate = { lat, lon };

/** Where the Sandbox belongs: the device location, or Gjakova when that cannot be had. */
export function locateCentre(): Promise<Coordinate> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    // The browser's own timeout does not run while its permission question goes unanswered.
    const timer = window.setTimeout(() => resolve(FALLBACK), ANSWER_TIMEOUT_MS);
    const settle = (point: Coordinate) => {
      window.clearTimeout(timer);
      resolve(point);
    };
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => settle({ lat: coords.latitude, lon: coords.longitude }),
      () => settle(FALLBACK),
      { enableHighAccuracy: true, timeout: ANSWER_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}
