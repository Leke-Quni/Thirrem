import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type AppConfig, loadConfig } from '../../src/config/app-config.js';
import { APP_CONFIG } from '../../src/config/app-config.provider.js';
import { configureApp } from '../../src/config/configure-app.js';
import { RATE_LIMIT, ROUTE_RATE_LIMIT, SEARCH_RATE_LIMIT, type RateLimitOptions } from '../../src/security/rate-limiter.js';
import { AppModule } from '../../src/app.module.js';
import { SimulationClock } from '../../src/simulation-clock/simulation-clock.js';
import { ROAD_GRAPH, type RoadGraph } from '../../src/road-graph/road-graph.js';
import { PaymentService } from '../../src/payments/payment.service.js';
import { PlaceSearchService } from '../../src/places/place-search.service.js';
import { RoutingService } from '../../src/routing/routing.service.js';
import { AreaRepository } from '../../src/sandbox/area.repository.js';
import { Pacer } from '../../src/sandbox/pacer.js';
import { RoadService } from '../../src/sandbox/road-service.js';
import { UnavailablePaymentService } from '../../src/payments/unavailable-payment.service.js';
import { FakeRoadService } from './fake-road-service.js';
import { StraightRoutingService } from './fake-routing.js';
import { ManualPacer } from './pacers.js';

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

export async function createTestApp(options: { clock?: ManualClock; roadGraph?: RoadGraph; routing?: RoutingService; places?: PlaceSearchService; roads?: RoadService; areas?: AreaRepository; pacer?: Pacer; payments?: PaymentService; config?: Partial<AppConfig>; rateLimit?: RateLimitOptions; routeRateLimit?: RateLimitOptions; searchRateLimit?: RateLimitOptions } = {}): Promise<INestApplication> {
  // Settling looks across every account, so only a test with a database of its own turns it on.
  const config = { ...loadConfig(), settleMs: 3_600_000, ...options.config };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(RATE_LIMIT)
    .useValue(options.rateLimit ?? { limit: 10_000, windowMs: 60_000 })
    .overrideProvider(ROUTE_RATE_LIMIT)
    .useValue(options.routeRateLimit ?? { limit: 10_000, windowMs: 60_000 })
    .overrideProvider(SEARCH_RATE_LIMIT)
    .useValue(options.searchRateLimit ?? { limit: 10_000, windowMs: 60_000 })
    // Never Stripe, whatever keys the environment holds. Rides are free unless the test hands over a payment service.
    .overrideProvider(PaymentService)
    .useValue(options.payments ?? new UnavailablePaymentService())
    // Never the public routing server, and no new path unless the test hands over a pacer.
    .overrideProvider(RoadService)
    .useValue(options.roads ?? new FakeRoadService())
    .overrideProvider(Pacer)
    .useValue(options.pacer ?? new ManualPacer());
  if (options.clock) builder = builder.overrideProvider(SimulationClock).useValue(options.clock);
  if (options.roadGraph) builder = builder.overrideProvider(ROAD_GRAPH).useValue(options.roadGraph);
  builder = builder.overrideProvider(RoutingService).useValue(options.routing ?? new StraightRoutingService());
  if (options.places) builder = builder.overrideProvider(PlaceSearchService).useValue(options.places);
  if (options.areas) builder = builder.overrideProvider(AreaRepository).useValue(options.areas);
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  configureApp(app, config);
  await app.init();
  return app;
}
