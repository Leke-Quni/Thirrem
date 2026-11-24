import { Module } from '@nestjs/common';
import { AccountRepository } from './auth/account.repository.js';
import { AuthService } from './auth/auth.service.js';
import { PasswordHasher, ScryptPasswordHasher } from './auth/password-hasher.js';
import { PgAccountRepository } from './auth/pg-account.repository.js';
import { RiderAuthController } from './auth/rider-auth.controller.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { ROAD_GRAPH, type RoadGraph } from './road-graph/road-graph.js';
import { RoadGraphController } from './road-graph/road-graph.controller.js';
import { SimulationClock, SystemClock } from './simulation-clock/simulation-clock.js';

const emptyRoadGraph: RoadGraph = { nodes: [], edges: [] };

@Module({
  controllers: [HealthController, RoadGraphController, RiderAuthController],
  providers: [
    DatabaseService,
    AuthService,
    { provide: AccountRepository, useClass: PgAccountRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: SimulationClock, useClass: SystemClock },
    { provide: ROAD_GRAPH, useValue: emptyRoadGraph },
  ],
})
export class AppModule {}
