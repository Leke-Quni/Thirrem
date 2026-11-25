import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { VEHICLE_TYPES } from '../vehicle-types.js';

/** Densest around the centre and thinning out, with each ring split equally between the Vehicle Types. */
const RINGS = [
  { fromM: 0, toM: 1_000, drivers: 20, candidates: 50, gapM: 0 },
  { fromM: 1_000, toM: 4_000, drivers: 12, candidates: 80, gapM: 500 },
  { fromM: 4_000, toM: 10_000, drivers: 8, candidates: 70, gapM: 500 },
];
const MAX_ROAD_OFFSET_M = 250;
const OUTER_M = 10_000;
const TURN_FROM_M = 500;
const TURN_TO_M = 2_500;
const EARTH_RADIUS_M = 6_371_000;

export type Random = () => number;

export interface Candidate {
  ring: number;
  point: Coordinate;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;

export function distanceM(a: Coordinate, b: Coordinate): number {
  const haversine =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function pointAt(from: Coordinate, bearing: number, metres: number): Coordinate {
  const angle = metres / EARTH_RADIUS_M;
  const lat1 = radians(from.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing));
  const lon2 = radians(from.lon) + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1), Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: degrees(lat2), lon: ((degrees(lon2) + 540) % 360) - 180 };
}

/** Where a Driver's path turns back: a short drive away, and never beyond the outer ring. */
export function turningPoint(centre: Coordinate, from: Coordinate, random: Random): Coordinate {
  const away = TURN_FROM_M + random() * (TURN_TO_M - TURN_FROM_M);
  const point = pointAt(from, random() * 2 * Math.PI, away);
  if (distanceM(centre, point) <= OUTER_M) return point;
  const share = away / distanceM(from, centre);
  return { lat: from.lat + (centre.lat - from.lat) * share, lon: from.lon + (centre.lon - from.lon) * share };
}

export function candidatePoints(centre: Coordinate, random: Random): Candidate[] {
  return RINGS.flatMap(({ fromM, toM, candidates }, ring) =>
    Array.from({ length: candidates }, () => {
      // The square root spreads points evenly over the ring's area instead of bunching them at its inner edge.
      const away = Math.sqrt(fromM ** 2 + random() * (toM ** 2 - fromM ** 2));
      return { ring, point: pointAt(centre, random() * 2 * Math.PI, away) };
    }),
  );
}

/**
 * `onRoad` holds the nearest road point of each candidate, in the same order, or null when none are known.
 *
 * The candidates closest to a road win. A random point is more often close to one where streets are dense,
 * so this leans Drivers towards built-up areas without counting streets.
 */
export function chooseDrivers(centre: Coordinate, candidates: Candidate[], onRoad: Coordinate[] | null, newId: () => string): Array<Omit<SimulatedDriver, 'heading'>> {
  const spreadOut: Coordinate[] = [];
  return RINGS.flatMap(({ fromM, toM, drivers, gapM }, ring) => {
    const road: Array<{ point: Coordinate; offsetM: number }> = [];
    const offRoad: Coordinate[] = [];
    candidates.forEach((candidate, index) => {
      if (candidate.ring !== ring) return;
      const snapped = onRoad?.[index];
      const away = snapped ? distanceM(centre, snapped) : 0;
      const offsetM = snapped ? distanceM(candidate.point, snapped) : 0;
      if (snapped && away >= fromM && away < toM && offsetM <= MAX_ROAD_OFFSET_M) road.push({ point: snapped, offsetM });
      else offRoad.push(candidate.point);
    });
    const closestFirst = road.sort((a, b) => a.offsetM - b.offsetM).map(({ point }) => point);

    const picked: Coordinate[] = [];
    // A road point is always better than none, so the gap is given up before a Driver is left off the road.
    for (const points of [closestFirst, offRoad]) {
      const crowded: Coordinate[] = [];
      for (const point of points) {
        if (picked.length === drivers) break;
        if (gapM && spreadOut.some((other) => distanceM(other, point) < gapM)) crowded.push(point);
        else {
          picked.push(point);
          if (gapM) spreadOut.push(point);
        }
      }
      picked.push(...crowded.slice(0, drivers - picked.length));
    }
    return picked.map(({ lat, lon }, index) => ({ id: newId(), vehicleType: VEHICLE_TYPES[index % VEHICLE_TYPES.length]!, lat, lon }));
  });
}
