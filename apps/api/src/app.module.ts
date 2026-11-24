import { Module } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { ROAD_GRAPH, type RoadGraph } from './road-graph/road-graph.js';
import { RoadGraphController } from './road-graph/road-graph.controller.js';
import { SimulationClock, SystemClock } from './simulation-clock/simulation-clock.js';

const emptyRoadGraph: RoadGraph = { nodes: [], edges: [] };

@Module({
  controllers: [HealthController, RoadGraphController],
  providers: [
    DatabaseService,
    { provide: SimulationClock, useClass: SystemClock },
    { provide: ROAD_GRAPH, useValue: emptyRoadGraph },
  ],
})
export class AppModule {}
