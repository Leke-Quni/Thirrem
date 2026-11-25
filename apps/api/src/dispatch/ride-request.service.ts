import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { RideRequest } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { type Coordinate, type RouteResult, RoutingService } from '../routing/routing.service.js';
import { Pacer } from '../sandbox/pacer.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { routed } from './drive.js';
import { isPickedUp } from './ride.js';
import { broadcast, firstToAccept, isOpen, isUnderWay, type RideRequestInput, rideRequestView, type StoredRideRequest } from './ride-request.js';

/** How long to wait before each further try, when the routing server cannot be had. */
const ROUTE_RETRY_AFTER_MS = [2_000, 5_000];

@Injectable()
export class RideRequestService {
  constructor(
    private readonly sandboxes: SandboxService,
    private readonly routing: RoutingService,
    private readonly pacer: Pacer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async request(accountId: string, input: RideRequestInput): Promise<RideRequest> {
    const { made, view } = await this.sandboxes.change(accountId, (sandbox, drivers, nowMs, positionAt) => {
      const current = sandbox.rideRequest;
      if (current && isUnderWay(current, nowMs)) {
        throw new ConflictException(isPickedUp(current, sandbox.resumedAtMs, nowMs) ? 'You are already on a Ride.' : 'You already have an open Ride Request.');
      }
      const rideRequest = broadcast(randomUUID(), input, drivers, this.config.dispatch, nowMs, Math.random);
      const winner = firstToAccept(rideRequest);
      const approach = winner && { from: positionAt(winner.driverId, winner.acceptsAtMs), matchedAtMs: winner.acceptsAtMs, route: null };
      const made = { ...rideRequest, approach };
      return { sandbox: { ...sandbox, rideRequest: made }, result: { made, view: rideRequestView(made, null, sandbox.resumedAtMs, nowMs) } };
    });
    // The route is looked for while Drivers decide, and the Rider is not kept waiting for it.
    void this.findRoutes(accountId, made);
    return view;
  }

  /** Looks for the matched Driver's route to the Pickup Point again, if the last search found none. */
  async retryRoute(accountId: string): Promise<void> {
    const again = await this.sandboxes.change(accountId, (sandbox, _drivers, nowMs) => {
      const open = sandbox.rideRequest;
      if (!open || !isOpen(open, sandbox.resumedAtMs, nowMs)) throw new ConflictException('You have no open Ride Request.');
      if (open.approach?.route !== 'unavailable') return { sandbox, result: null };
      const rideRequest: StoredRideRequest = { ...open, approach: { ...open.approach, route: null } };
      return { sandbox: { ...sandbox, rideRequest }, result: rideRequest };
    });
    if (again) void this.findRoutes(accountId, again);
  }

  /** Looks for the Ride's route to the Drop-off Point again, if the last search found none. */
  async retryRideRoute(accountId: string): Promise<void> {
    const again = await this.sandboxes.change(accountId, (sandbox, _drivers, nowMs) => {
      const current = sandbox.rideRequest;
      if (!current || !isPickedUp(current, sandbox.resumedAtMs, nowMs)) throw new ConflictException('You are not on a Ride.');
      if (current.rideRoute !== 'unavailable') return { sandbox, result: null };
      const rideRequest: StoredRideRequest = { ...current, rideRoute: null };
      return { sandbox: { ...sandbox, rideRequest }, result: rideRequest };
    });
    if (again) void this.findRideRoute(accountId, again);
  }

  /** The route to the Pickup Point, and once there is one, the Ride's route, which nothing needs sooner. */
  private async findRoutes(accountId: string, rideRequest: StoredRideRequest): Promise<void> {
    const { pickup, approach } = rideRequest;
    if (!approach) return;
    const { lat, lon } = approach.from;
    const route = await this.routeWithRetries({ lat, lon }, pickup);
    await this.amendRideRequest(accountId, rideRequest.id, (current, nowMs) => current.approach && { ...current, approach: { ...current.approach, route: routed(route, nowMs) } });
    if (route) await this.findRideRoute(accountId, rideRequest);
  }

  private async findRideRoute(accountId: string, { id, pickup, dropoff }: StoredRideRequest): Promise<void> {
    const route = await this.routeWithRetries(pickup, dropoff);
    await this.amendRideRequest(accountId, id, (current, nowMs) => ({ ...current, rideRoute: routed(route, nowMs) }));
  }

  /** Changes the Ride Request with what was found for it, unless the Sandbox has moved on to another. */
  private amendRideRequest(accountId: string, id: string, amend: (rideRequest: StoredRideRequest, nowMs: number) => StoredRideRequest | undefined): Promise<void> {
    return this.sandboxes.amend(accountId, (sandbox, nowMs) => {
      const { rideRequest } = sandbox;
      if (rideRequest?.id !== id) return sandbox;
      return { ...sandbox, rideRequest: amend(rideRequest, nowMs) ?? rideRequest };
    });
  }

  /** Null when there is no road between the two, which trying again would not change, or when every try failed. */
  private async routeWithRetries(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.routing.route(from, to);
      } catch {
        const waitMs = ROUTE_RETRY_AFTER_MS[attempt];
        if (waitMs === undefined) return null;
        await this.pacer.pause(waitMs);
      }
    }
  }
}
