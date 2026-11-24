import { BadRequestException, ServiceUnavailableException, Body, Controller, Headers, HttpCode, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import type { RouteResponse } from '@thirrem/types';
import { RouteRateLimitGuard } from '../security/rate-limiter.js';
import { AuthService } from '../auth/auth.service.js';
import { type Coordinate, RoutingService } from './routing.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

function parseCoordinate(value: unknown, label: string): Coordinate {
  const { lat, lon } = (value ?? {}) as Record<string, unknown>;
  const valid =
    typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!valid) throw new BadRequestException(`${label} needs a latitude and longitude.`);
  return { lat, lon };
}

@Controller('rider')
export class RiderRouteController {
  constructor(
    private readonly auth: AuthService,
    private readonly routing: RoutingService,
  ) {}

  @Post('route')
  @UseGuards(RouteRateLimitGuard)
  @HttpCode(200)
  async route(@Headers('authorization') authorization: string | undefined, @Body() body: { pickup?: unknown; dropoff?: unknown }): Promise<RouteResponse> {
    await this.auth.authenticate('rider', bearerToken(authorization));
    const pickup = parseCoordinate(body?.pickup, 'The Pickup Point');
    const dropoff = parseCoordinate(body?.dropoff, 'The Drop-off Point');
    const result = await this.routing.route(pickup, dropoff).catch(() => {
      throw new ServiceUnavailableException('Routing is unavailable right now. Try again in a moment.');
    });
    if (!result) throw new UnprocessableEntityException('There is no road route between these two points. Try moving a pin closer to a street.');
    return result;
  }
}
