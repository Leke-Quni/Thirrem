import type { Coordinate } from '@thirrem/types';

export abstract class RoadService {
  /** The nearest road point of each point, in the same order. */
  abstract snap(points: Coordinate[]): Promise<Coordinate[]>;

  /** The direction of the street at each point, in degrees clockwise from north, in the same order. */
  abstract headings(points: Coordinate[]): Promise<number[]>;
}
