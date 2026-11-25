import { BadRequestException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { Coordinate, RouteResult, RoutingService } from './routing.service.js';

export interface RouteRequest {
  pickup?: unknown;
  dropoff?: unknown;
}

export function parseCoordinate(value: unknown, label: string): Coordinate {
  const { lat, lon } = (value ?? {}) as Record<string, unknown>;
  const valid =
    typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!valid) throw new BadRequestException(`${label} needs a latitude and longitude.`);
  return { lat, lon };
}

export async function requestedRoute(routing: RoutingService, body: RouteRequest | undefined): Promise<RouteResult> {
  const pickup = parseCoordinate(body?.pickup, 'The Pickup Point');
  const dropoff = parseCoordinate(body?.dropoff, 'The Drop-off Point');
  const result = await routing.route(pickup, dropoff).catch(() => {
    throw new ServiceUnavailableException('Routing is unavailable right now. Try again in a moment.');
  });
  if (!result) throw new UnprocessableEntityException('There is no road route between these two points. Try moving a pin closer to a street.');
  return result;
}
