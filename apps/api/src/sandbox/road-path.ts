import type { Coordinate } from '@thirrem/types';
import { distanceM } from './driver-placement.js';
import type { RoadRoute } from './road-service.js';

const MIN_LENGTH_M = 50;

export interface PathPosition extends Coordinate {
  heading: number;
}

export interface RoadPath {
  lengthM: number;
  speedMps: number;
  /** Where a vehicle is after driving `metres` from the start, going round again after each lap. */
  at(metres: number): PathPosition;
}

function bearing(from: Coordinate, to: Coordinate): number {
  const east = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
  return ((Math.atan2(east, to.lat - from.lat) * 180) / Math.PI + 360) % 360;
}

/** The length of the line through the points, and where a vehicle is a number of metres along it. */
function measured(points: Coordinate[]) {
  const stretches: Array<{ from: Coordinate; to: Coordinate; startM: number; lengthM: number; heading: number }> = [];
  let lengthM = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const stretchM = distanceM(from, to);
    if (stretchM === 0) continue;
    stretches.push({ from, to, startM: lengthM, lengthM: stretchM, heading: bearing(from, to) });
    lengthM += stretchM;
  }

  return {
    lengthM,
    /** The points further along than `metres`. */
    beyond: (metres: number): Coordinate[] => stretches.filter(({ startM, lengthM: stretchM }) => startM + stretchM > metres).map(({ to }) => to),
    along(metres: number): PathPosition {
      let low = 0;
      let high = stretches.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (stretches[middle]!.startM <= metres) low = middle;
        else high = middle - 1;
      }
      const { from, to, startM, lengthM: stretchM, heading } = stretches[low]!;
      const share = (metres - startM) / stretchM;
      return { lat: from.lat + (to.lat - from.lat) * share, lon: from.lon + (to.lon - from.lon) * share, heading };
    },
  };
}

/** A closed route made drivable at its average speed, or null when there is too little of it to drive. */
export function roadPath({ points, durationS }: RoadRoute): RoadPath | null {
  const { lengthM, along } = measured(points);
  if (lengthM < MIN_LENGTH_M || !(durationS > 0)) return null;
  return { lengthM, speedMps: lengthM / durationS, at: (metres) => along(((metres % lengthM) + lengthM) % lengthM) };
}

/** A route driven once, from its start to its end, by the share of it already driven. */
export interface OneWayPath {
  at(share: number): PathPosition;
  /** The line still to be driven, starting where the vehicle is. */
  ahead(share: number): Coordinate[];
}

/** Null when the points are all in one place. */
export function oneWayPath(points: Coordinate[]): OneWayPath | null {
  const { lengthM, along, beyond } = measured(points);
  if (!(lengthM > 0)) return null;
  const metres = (share: number) => Math.min(1, Math.max(0, share)) * lengthM;
  const at = (share: number) => along(metres(share));
  return {
    at,
    ahead(share) {
      const { lat, lon } = at(share);
      return [{ lat, lon }, ...beyond(metres(share))];
    },
  };
}
