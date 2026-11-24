import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@thirrem/types';
import { DatabaseService } from '../database/database.service.js';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly clock: SimulationClock,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    await this.database.ping();
    return { status: 'ok', database: 'up', simulationTime: this.clock.now().toISOString() };
  }
}
