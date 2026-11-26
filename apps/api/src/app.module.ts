import { Module } from '@nestjs/common';
import { AccountRepository } from './auth/account.repository.js';
import { AuthService } from './auth/auth.service.js';
import { DriverAuthController } from './auth/driver-auth.controller.js';
import { PasswordHasher, ScryptPasswordHasher } from './auth/password-hasher.js';
import { PgAccountRepository } from './auth/pg-account.repository.js';
import { RiderAuthController } from './auth/rider-auth.controller.js';
import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG, appConfigProvider } from './config/app-config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { DriverVehicleController } from './onboarding/driver-vehicle.controller.js';
import { PgVehicleRepository } from './onboarding/pg-vehicle.repository.js';
import { VehicleRepository } from './onboarding/vehicle.repository.js';
import { VehicleService } from './onboarding/vehicle.service.js';
import { RiderFareController } from './fares/rider-fare.controller.js';
import { HealthController } from './health/health.controller.js';
import { ROAD_GRAPH, type RoadGraph } from './road-graph/road-graph.js';
import { CancelHistoryRepository } from './dispatch/cancel-history.repository.js';
import { InMemoryCancelHistoryRepository } from './dispatch/in-memory-cancel-history.repository.js';
import { RideRequestService } from './dispatch/ride-request.service.js';
import { RiderRideRequestController } from './dispatch/rider-ride-request.controller.js';
import { RoadGraphController } from './road-graph/road-graph.controller.js';
import { CachingRoutingService } from './routing/caching-routing.service.js';
import { OsrmRoutingService } from './routing/osrm-routing.service.js';
import { RiderRouteController } from './routing/rider-route.controller.js';
import { RoutingService } from './routing/routing.service.js';
import { CachingPlaceSearchService } from './places/caching-place-search.service.js';
import { PhotonPlaceSearchService } from './places/photon-place-search.service.js';
import { PlaceSearchService } from './places/place-search.service.js';
import { RiderPlacesController } from './places/rider-places.controller.js';
import { AuthRateLimitGuard, FareRateLimitGuard, RATE_LIMIT, RideRequestRateLimitGuard, ROUTE_RATE_LIMIT, RouteRateLimitGuard, SandboxRateLimitGuard, SEARCH_RATE_LIMIT, SearchRateLimitGuard } from './security/rate-limiter.js';
import { AreaRepository } from './sandbox/area.repository.js';
import { AreaService } from './sandbox/area.service.js';
import { DriverSandboxController } from './sandbox/driver-sandbox.controller.js';
import { DriverSandboxRepository } from './sandbox/driver-sandbox.repository.js';
import { DriverSandboxService } from './sandbox/driver-sandbox.service.js';
import { InMemoryAreaRepository } from './sandbox/in-memory-area.repository.js';
import { InMemorySandboxRepository } from './sandbox/in-memory-sandbox.repository.js';
import { OsrmRoadService } from './sandbox/osrm-road-service.js';
import { Pacer, SystemPacer } from './sandbox/pacer.js';
import { PathFetcher } from './sandbox/path-fetcher.js';
import { RiderActivity } from './sandbox/rider-activity.js';
import { RiderLiveGateway } from './sandbox/rider-live.gateway.js';
import { RiderSandboxController } from './sandbox/rider-sandbox.controller.js';
import { RoadService } from './sandbox/road-service.js';
import { RunningSandboxes } from './sandbox/running-sandboxes.js';
import { SandboxRepository } from './sandbox/sandbox.repository.js';
import { SandboxSweeper } from './sandbox/sandbox-sweeper.js';
import { SandboxService } from './sandbox/sandbox.service.js';
import { SimulationClock, SystemClock } from './simulation-clock/simulation-clock.js';

const emptyRoadGraph: RoadGraph = { nodes: [], edges: [] };

@Module({
  controllers: [HealthController, RoadGraphController, RiderAuthController, DriverAuthController, DriverVehicleController, RiderRouteController, RiderFareController, RiderPlacesController, RiderSandboxController, RiderRideRequestController, DriverSandboxController],
  providers: [
    appConfigProvider,
    AuthRateLimitGuard,
    { provide: RATE_LIMIT, useFactory: (config: AppConfig) => config.authRateLimit, inject: [APP_CONFIG] },
    DatabaseService,
    AuthService,
    { provide: AccountRepository, useClass: PgAccountRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    VehicleService,
    { provide: VehicleRepository, useClass: PgVehicleRepository },
    { provide: SimulationClock, useClass: SystemClock },
    {
      provide: RoutingService,
      useFactory: (config: AppConfig) => new CachingRoutingService(new OsrmRoutingService(config.osrmUrl)),
      inject: [APP_CONFIG],
    },
    RouteRateLimitGuard,
    FareRateLimitGuard,
    SandboxRateLimitGuard,
    SandboxService,
    RideRequestRateLimitGuard,
    RideRequestService,
    { provide: CancelHistoryRepository, useClass: InMemoryCancelHistoryRepository },
    { provide: RiderActivity, useExisting: SandboxService },
    RiderLiveGateway,
    SandboxSweeper,
    AreaService,
    PathFetcher,
    { provide: Pacer, useClass: SystemPacer },
    { provide: AreaRepository, useFactory: () => new InMemoryAreaRepository() },
    RunningSandboxes,
    { provide: SandboxRepository, useFactory: (running: RunningSandboxes) => new InMemorySandboxRepository(running), inject: [RunningSandboxes] },
    DriverSandboxService,
    { provide: DriverSandboxRepository, useFactory: (running: RunningSandboxes) => new InMemorySandboxRepository(running), inject: [RunningSandboxes] },
    { provide: RoadService, useFactory: (config: AppConfig) => new OsrmRoadService(config.osrmUrl), inject: [APP_CONFIG] },
    SearchRateLimitGuard,
    { provide: SEARCH_RATE_LIMIT, useFactory: (config: AppConfig) => config.searchRateLimit, inject: [APP_CONFIG] },
    {
      provide: PlaceSearchService,
      useFactory: (config: AppConfig) => new CachingPlaceSearchService(new PhotonPlaceSearchService(config.photonUrl)),
      inject: [APP_CONFIG],
    },
    { provide: ROUTE_RATE_LIMIT, useFactory: (config: AppConfig) => config.routeRateLimit, inject: [APP_CONFIG] },
    { provide: ROAD_GRAPH, useValue: emptyRoadGraph },
  ],
})
export class AppModule {}
