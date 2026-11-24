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
