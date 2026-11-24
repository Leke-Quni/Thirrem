import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { SimulationClock } from '../../src/simulation-clock/simulation-clock.js';
import { ROAD_GRAPH, type RoadGraph } from '../../src/road-graph/road-graph.js';

export class ManualClock extends SimulationClock {
  constructor(private current: Date) {
    super();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export async function createTestApp(options: { clock?: ManualClock; roadGraph?: RoadGraph } = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) builder = builder.overrideProvider(SimulationClock).useValue(options.clock);
  if (options.roadGraph) builder = builder.overrideProvider(ROAD_GRAPH).useValue(options.roadGraph);
  const app = (await builder.compile()).createNestApplication();
  await app.init();
  return app;
}
