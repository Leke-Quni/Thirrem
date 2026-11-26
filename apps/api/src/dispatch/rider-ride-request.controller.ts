import { BadRequestException, Body, Controller, Delete, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import type { RideRequest, VehicleType } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { parseCoordinate } from '../routing/requested-route.js';
import { RideRequestRateLimitGuard } from '../security/rate-limiter.js';
import { VEHICLE_TYPES } from '../vehicle-types.js';
import { RideRequestService } from './ride-request.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

function parseVehicleType(value: unknown): VehicleType {
  if (!VEHICLE_TYPES.includes(value as VehicleType)) throw new BadRequestException('Choose a Vehicle Type.');
  return value as VehicleType;
}

const MAX_NAME_LENGTH = 200;

/** A pin on a road with no name is kept as just that, as coordinates are never saved. */
const parseName = (value: unknown) => (typeof value === 'string' && value.trim().slice(0, MAX_NAME_LENGTH)) || 'Pin on the map';

@Controller('rider')
export class RiderRideRequestController {
  constructor(
    private readonly auth: AuthService,
    private readonly rideRequests: RideRequestService,
  ) {}

  @Post('ride-requests')
  @UseGuards(RideRequestRateLimitGuard)
  async request(@Headers('authorization') authorization: string | undefined, @Body() body: { pickup?: unknown; dropoff?: unknown; vehicleType?: unknown; pickupName?: unknown; dropoffName?: unknown; holdId?: unknown } | undefined): Promise<RideRequest> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    const input = {
      pickup: parseCoordinate(body?.pickup, 'The Pickup Point'),
      dropoff: parseCoordinate(body?.dropoff, 'The Drop-off Point'),
      vehicleType: parseVehicleType(body?.vehicleType),
    };
    return this.rideRequests.request(account.id, input, { pickupName: parseName(body?.pickupName), dropoffName: parseName(body?.dropoffName) }, body?.holdId);
  }

  @Delete('ride-requests')
  @UseGuards(RideRequestRateLimitGuard)
  @HttpCode(204)
  async cancel(@Headers('authorization') authorization: string | undefined, @Query('pause') pause: unknown): Promise<void> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    await this.rideRequests.cancel(account.id, pause === 'accepted');
  }

  @Post('ride-requests/approach')
  @UseGuards(RideRequestRateLimitGuard)
  @HttpCode(204)
  async retryRoute(@Headers('authorization') authorization: string | undefined, @Body() body: { holdId?: unknown } | undefined): Promise<void> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    await this.rideRequests.retryRoute(account.id, body?.holdId);
  }

  @Post('rides/end')
  @UseGuards(RideRequestRateLimitGuard)
  @HttpCode(204)
  async endRide(@Headers('authorization') authorization: string | undefined): Promise<void> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    await this.rideRequests.endRide(account.id);
  }

  @Post('rides/route')
  @UseGuards(RideRequestRateLimitGuard)
  @HttpCode(204)
  async retryRideRoute(@Headers('authorization') authorization: string | undefined, @Body() body: { holdId?: unknown } | undefined): Promise<void> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    await this.rideRequests.retryRideRoute(account.id, body?.holdId);
  }
}
