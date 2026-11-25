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

/** A closed route made drivable at its average speed, or null when there is too little of it to drive. */
export function roadPath({ points, durationS }: RoadRoute): RoadPath | null {
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
  if (lengthM < MIN_LENGTH_M || !(durationS > 0)) return null;

  return {
    lengthM,
    speedMps: lengthM / durationS,
    at(metres) {
      const lapM = ((metres % lengthM) + lengthM) % lengthM;
      let low = 0;
      let high = stretches.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (stretches[middle]!.startM <= lapM) low = middle;
        else high = middle - 1;
      }
      const { from, to, startM, lengthM: stretchM, heading } = stretches[low]!;
      const share = (lapM - startM) / stretchM;
      return { lat: from.lat + (to.lat - from.lat) * share, lon: from.lon + (to.lon - from.lon) * share, heading };
    },
  };
}
