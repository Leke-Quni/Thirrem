import { Body, Controller, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { FareResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { requestedRoute, type RouteRequest } from '../routing/requested-route.js';
import { RoutingService } from '../routing/routing.service.js';
import { FareRateLimitGuard } from '../security/rate-limiter.js';
import { calculateFares } from './fare-calculator.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider')
export class RiderFareController {
  constructor(
    private readonly auth: AuthService,
    private readonly routing: RoutingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('fare')
  @UseGuards(FareRateLimitGuard)
  @HttpCode(200)
  async fare(@Headers('authorization') authorization: string | undefined, @Body() body: RouteRequest): Promise<FareResponse> {
    await this.auth.authenticate('rider', bearerToken(authorization));
    const { distanceM, durationS } = await requestedRoute(this.routing, body);
    return { distanceM, durationS, fares: calculateFares(this.config.fareRates, { distanceM, durationS }) };
  }
}
