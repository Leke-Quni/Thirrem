import type { Coordinate } from '@thirrem/types';
import { RoadService } from '../../src/sandbox/road-service.js';

/** Treats every point as already on a road and numbers the headings, unless told to fail. */
export class FakeRoadService extends RoadService {
  readonly requests: Coordinate[][] = [];
  readonly headingRequests: Coordinate[][] = [];

  constructor(private readonly failure?: Error) {
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
}
