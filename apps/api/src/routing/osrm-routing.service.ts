import { type Coordinate, type RouteResult, RoutingService } from './routing.service.js';

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
}

export class OsrmRoutingService extends RoutingService {
  constructor(private readonly baseUrl: string) {
    super();
  }

  async route(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
    const path = `/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'thirrem-demo (portfolio ride-hailing simulation)' } });
    const body = (await response.json().catch(() => ({}))) as OsrmRouteResponse;
    if (body.code === 'NoRoute' || body.code === 'NoSegment') return null;
    const best = body.routes?.[0];
    if (!response.ok || body.code !== 'Ok' || !best) throw new Error(`OSRM answered ${response.status} ${body.code ?? ''}`.trim());
    return { distanceM: best.distance, durationS: best.duration, geometry: best.geometry.coordinates };
  }
}
