import type { Coordinate } from '@thirrem/types';
import { RoadService } from './road-service.js';

interface OsrmResponse {
  code: string;
  destinations?: Array<{ location: [number, number] }>;
  routes?: Array<{ legs: Array<{ steps: Array<{ maneuver: { bearing_before: number; bearing_after: number } }> }> }>;
}

export class OsrmRoadService extends RoadService {
  constructor(private readonly baseUrl: string) {
    super();
  }

  // A table request reports the road point of every coordinate, so one request covers them all. Its durations are not used.
  async snap(points: Coordinate[]): Promise<Coordinate[]> {
    const { body, failure } = await this.ask('table', points, 'sources=0');
    if (body.destinations?.length !== points.length) throw failure;
    return body.destinations.map(({ location: [lon, lat] }) => ({ lat, lon }));
  }

  // Each leg of one route through the points sets off along the street at its start, and the last one arrives along the final street.
  async headings(points: Coordinate[]): Promise<number[]> {
    const { body, failure } = await this.ask('route', points, 'steps=true&overview=false');
    const legs = body.routes?.[0]?.legs;
    const arrival = legs?.at(-1)?.steps.at(-1);
    if (!legs || !arrival || legs.length !== points.length - 1) throw failure;
    return [...legs.map((leg) => leg.steps[0]!.maneuver.bearing_after), arrival.maneuver.bearing_before];
  }

  private async ask(service: 'table' | 'route', points: Coordinate[], query: string) {
    const coordinates = points.map(({ lat, lon }) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const response = await fetch(`${this.baseUrl}/${service}/v1/driving/${coordinates}?${query}`, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'thirrem-demo (portfolio ride-hailing simulation)' } });
    const body = (await response.json().catch(() => ({}))) as OsrmResponse;
    const failure = new Error(`OSRM answered ${response.status} ${body.code ?? ''}`.trim());
    if (!response.ok || body.code !== 'Ok') throw failure;
    return { body, failure };
  }
}
