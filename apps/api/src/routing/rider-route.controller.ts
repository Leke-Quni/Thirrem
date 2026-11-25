import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { RouteResponse } from '@thirrem/types';
import { RouteRateLimitGuard } from '../security/rate-limiter.js';
import { AuthService } from '../auth/auth.service.js';
import { requestedRoute, type RouteRequest } from './requested-route.js';
import { RoutingService } from './routing.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider')
export class RiderRouteController {
  constructor(
    private readonly auth: AuthService,
    private readonly routing: RoutingService,
  ) {}

  @Post('route')
  @UseGuards(RouteRateLimitGuard)
  @HttpCode(200)
  async route(@Headers('authorization') authorization: string | undefined, @Body() body: RouteRequest): Promise<RouteResponse> {
    await this.auth.authenticate('rider', bearerToken(authorization));
    return requestedRoute(this.routing, body);
  }
}
