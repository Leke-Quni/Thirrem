import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import type { DriverVehicleResponse, VehicleOptionsResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { VEHICLE_COLOURS, VEHICLE_MODELS } from '../vehicle-catalogue.js';
import { VehicleService } from './vehicle.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('driver')
export class DriverVehicleController {
  constructor(
    private readonly auth: AuthService,
    private readonly vehicles: VehicleService,
  ) {}

  @Get('vehicle-options')
  options(): VehicleOptionsResponse {
    return { models: VEHICLE_MODELS, colours: VEHICLE_COLOURS };
  }

  @Get('vehicle')
  async read(@Headers('authorization') authorization?: string): Promise<DriverVehicleResponse> {
    const account = await this.auth.authenticate('driver', bearerToken(authorization));
    return { vehicle: await this.vehicles.find(account.id) };
  }

  @Post('vehicle')
  async register(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { vehicleType?: unknown; model?: unknown; colour?: unknown } | undefined,
  ): Promise<DriverVehicleResponse> {
    const account = await this.auth.authenticate('driver', bearerToken(authorization));
    return { vehicle: await this.vehicles.register(account.id, body?.vehicleType, body?.model, body?.colour) };
  }
}
