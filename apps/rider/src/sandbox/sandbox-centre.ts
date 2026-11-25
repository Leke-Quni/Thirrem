import { DEFAULT_VIEW } from '@thirrem/map';
import type { Coordinate } from '@thirrem/types';

export type DeviceLocation = { status: 'finding' } | { status: 'found'; point: Coordinate } | { status: 'unavailable' };

const [lon, lat] = DEFAULT_VIEW.center;
const FALLBACK: Coordinate = { lat, lon };
const SAME_PLACE_KM = 1;
const FAR_PICKUP_KM = 10;

function distanceKm(a: Coordinate, b: Coordinate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const haversine =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Where the simulated Drivers belong, or null while that is not yet known. */
export function sandboxCentre(location: DeviceLocation, pickup: Coordinate | null): Coordinate | null {
  if (location.status === 'found') return pickup && distanceKm(location.point, pickup) > FAR_PICKUP_KM ? pickup : location.point;
  if (pickup) return pickup;
  return location.status === 'unavailable' ? FALLBACK : null;
}

export const movedAway = (from: Coordinate, to: Coordinate): boolean => distanceKm(from, to) > SAME_PLACE_KM;
