import { Injectable } from '@nestjs/common';
import type { VehicleType } from '@thirrem/types';
import { DatabaseService } from '../database/database.service.js';
import { DuplicateVehicleError, type RegisteredVehicle, VehicleRepository } from './vehicle.repository.js';

interface VehicleRow {
  vehicle_type: VehicleType;
  model: string;
  colour: string;
  plate: string;
  submitted_at: Date;
}

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class PgVehicleRepository extends VehicleRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findByAccount(accountId: string): Promise<RegisteredVehicle | null> {
    const { rows } = await this.database.query<VehicleRow>('SELECT * FROM driver_vehicles WHERE account_id = $1', [accountId]);
    const row = rows[0];
    return row ? { vehicleType: row.vehicle_type, model: row.model, colour: row.colour, plate: row.plate, submittedAt: row.submitted_at } : null;
  }

  async create(accountId: string, vehicle: RegisteredVehicle): Promise<void> {
    try {
      await this.database.query(
        'INSERT INTO driver_vehicles (account_id, vehicle_type, model, colour, plate, submitted_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [accountId, vehicle.vehicleType, vehicle.model, vehicle.colour, vehicle.plate, vehicle.submittedAt],
      );
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new DuplicateVehicleError();
      throw error;
    }
  }
}
