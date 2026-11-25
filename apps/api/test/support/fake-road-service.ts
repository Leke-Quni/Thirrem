import type { Coordinate } from '@thirrem/types';
import { distanceM } from '../../src/sandbox/driver-placement.js';
import { type RoadRoute, RoadService } from '../../src/sandbox/road-service.js';

/** Treats every point as already on a road and numbers the headings, unless told to fail. */
export class FakeRoadService extends RoadService {
  readonly requests: Coordinate[][] = [];
  readonly headingRequests: Coordinate[][] = [];

  readonly routeRequests: Coordinate[][] = [];

  constructor(public failure?: Error) {
    super();
  }

  async snap(points: Coordinate[]): Promise<Coordinate[]> {
    this.requests.push(points);
    if (this.failure) throw this.failure;
    return points;
  }

  async headings(points: Coordinate[]): Promise<number[]> {
    this.headingRequests.push(points);
    if (this.failure) throw this.failure;
    return points.map((_, index) => index);
  }

  /** Straight lines between the points, driven at 10 m/s. */
  async route(points: Coordinate[]): Promise<RoadRoute> {
    this.routeRequests.push(points);
    if (this.failure) throw this.failure;
    const lengthM = points.slice(1).reduce((total, point, index) => total + distanceM(points[index]!, point), 0);
    return { points, durationS: lengthM / 10 };
  }
}
