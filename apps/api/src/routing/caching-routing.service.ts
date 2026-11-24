import { type Coordinate, type RouteResult, RoutingService } from './routing.service.js';

const key = (from: Coordinate, to: Coordinate) =>
  [from.lat, from.lon, to.lat, to.lon].map((value) => value.toFixed(5)).join(',');

export class CachingRoutingService extends RoutingService {
  private readonly routes = new Map<string, RouteResult | null>();

  constructor(
    private readonly inner: RoutingService,
    private readonly capacity = 500,
  ) {
    super();
  }

  async route(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
    const id = key(from, to);
    if (this.routes.has(id)) return this.routes.get(id) ?? null;
    const result = await this.inner.route(from, to);
    this.routes.set(id, result);
    if (this.routes.size > this.capacity) this.routes.delete(this.routes.keys().next().value!);
    return result;
  }
}
