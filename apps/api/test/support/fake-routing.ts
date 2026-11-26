import { distanceM } from '../../src/sandbox/driver-placement.js';
import { type Coordinate, type RouteResult, RoutingService } from '../../src/routing/routing.service.js';

export class FakeRoutingService extends RoutingService {
  readonly requests: Array<{ from: Coordinate; to: Coordinate }> = [];

  constructor(private readonly result: RouteResult | null | Error) {
    super();
  }

  async route(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
    this.requests.push({ from, to });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

/** A straight line between the two points, driven at 10 m/s, unless told to fail or to find no road. */
export class StraightRoutingService extends RoutingService {
  readonly requests: Array<{ from: Coordinate; to: Coordinate }> = [];
  outcome: 'route' | 'no route' | 'down' = 'route';
  /** Set to keep every answer back until it resolves. */
  held: Promise<void> | null = null;
  /** Points the line goes through on its way, as a road with bends does. */
  via: Coordinate[] = [];
  metresPerSecond = 10;
  private next?: () => void;

  /** Runs `change` once the next route has been answered. */
  afterFirst(change: () => void): void {
    this.next = change;
  }

  async route(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
    this.requests.push({ from, to });
    await this.held;
    if (this.outcome === 'down') throw new Error('Routing is down');
    if (this.outcome === 'no route') return null;
    const length = distanceM(from, to);
    const found: RouteResult = { distanceM: length, durationS: length / this.metresPerSecond, geometry: [from, ...this.via, to].map(({ lat, lon }) => [lon, lat]) };
    const next = this.next;
    this.next = undefined;
    next?.();
    return found;
  }
}
