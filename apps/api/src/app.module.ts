import { Module } from '@nestjs/common';
import { AccountRepository } from './auth/account.repository.js';
import { AuthService } from './auth/auth.service.js';
import { PasswordHasher, ScryptPasswordHasher } from './auth/password-hasher.js';
import { PgAccountRepository } from './auth/pg-account.repository.js';
import { RiderAuthController } from './auth/rider-auth.controller.js';
import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG, appConfigProvider } from './config/app-config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { ROAD_GRAPH, type RoadGraph } from './road-graph/road-graph.js';
import { RoadGraphController } from './road-graph/road-graph.controller.js';
import { CachingRoutingService } from './routing/caching-routing.service.js';
import { OsrmRoutingService } from './routing/osrm-routing.service.js';
import { RiderRouteController } from './routing/rider-route.controller.js';
import { RoutingService } from './routing/routing.service.js';
import { AuthRateLimitGuard, RATE_LIMIT, ROUTE_RATE_LIMIT, RouteRateLimitGuard } from './security/rate-limiter.js';
import { SimulationClock, SystemClock } from './simulation-clock/simulation-clock.js';

const emptyRoadGraph: RoadGraph = { nodes: [], edges: [] };

@Module({
  controllers: [HealthController, RoadGraphController, RiderAuthController, RiderRouteController],
  providers: [
    appConfigProvider,
    AuthRateLimitGuard,
    { provide: RATE_LIMIT, useFactory: (config: AppConfig) => config.authRateLimit, inject: [APP_CONFIG] },
    DatabaseService,
    AuthService,
    { provide: AccountRepository, useClass: PgAccountRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: SimulationClock, useClass: SystemClock },
    {
      provide: RoutingService,
      useFactory: (config: AppConfig) => new CachingRoutingService(new OsrmRoutingService(config.osrmUrl)),
      inject: [APP_CONFIG],
    },
    RouteRateLimitGuard,
    { provide: ROUTE_RATE_LIMIT, useFactory: (config: AppConfig) => config.routeRateLimit, inject: [APP_CONFIG] },
    { provide: ROAD_GRAPH, useValue: emptyRoadGraph },
  ],
})
export class AppModule {}
