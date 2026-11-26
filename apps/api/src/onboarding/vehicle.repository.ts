import type { VehicleType } from '@thirrem/types';

export interface RegisteredVehicle {
  vehicleType: VehicleType;
  model: string;
  colour: string;
  plate: string;
  submittedAt: Date;
}

export class DuplicateVehicleError extends Error {}

export abstract class VehicleRepository {
  abstract findByAccount(accountId: string): Promise<RegisteredVehicle | null>;
  /** Throws DuplicateVehicleError when the account already has a vehicle. */
  abstract create(accountId: string, vehicle: RegisteredVehicle): Promise<void>;
}
