import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { DriverVehicle, VehicleType } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { madeUpPlate, VEHICLE_COLOURS, VEHICLE_MODELS } from '../vehicle-catalogue.js';
import { VEHICLE_TYPES } from '../vehicle-types.js';
import { DuplicateVehicleError, type RegisteredVehicle, VehicleRepository } from './vehicle.repository.js';

@Injectable()
export class VehicleService {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: SimulationClock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async find(accountId: string): Promise<DriverVehicle | null> {
    const vehicle = await this.vehicles.findByAccount(accountId);
    return vehicle && this.describe(vehicle);
  }

  async register(accountId: string, vehicleType: unknown, model: unknown, colour: unknown): Promise<DriverVehicle> {
    if (!VEHICLE_TYPES.includes(vehicleType as VehicleType)) throw new BadRequestException('Choose a Vehicle Type.');
    if (!VEHICLE_MODELS[vehicleType as VehicleType].includes(model as string)) {
      throw new BadRequestException('Choose a model from the list for this Vehicle Type.');
    }
    if (!VEHICLE_COLOURS.includes(colour as string)) throw new BadRequestException('Choose a colour from the list.');
    const vehicle: RegisteredVehicle = {
      vehicleType: vehicleType as VehicleType,
      model: model as string,
      colour: colour as string,
      plate: madeUpPlate(Math.random),
      submittedAt: this.clock.now(),
    };
    try {
      await this.vehicles.create(accountId, vehicle);
    } catch (error) {
      if (error instanceof DuplicateVehicleError) throw new ConflictException('You have already registered a vehicle.');
      throw error;
    }
    return this.describe(vehicle);
  }

  private describe({ submittedAt, ...vehicle }: RegisteredVehicle): DriverVehicle {
    const approved = this.clock.now().getTime() - submittedAt.getTime() >= this.config.driverApprovalMs;
    return { ...vehicle, status: approved ? 'approved' : 'pending' };
  }
}
