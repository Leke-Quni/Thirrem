import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { RideRequest } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { type Coordinate, type RouteResult, RoutingService } from '../routing/routing.service.js';
import { Pacer } from '../sandbox/pacer.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { approachRouted } from './approach.js';
import { broadcast, firstToAccept, isOpen, type RideRequestInput, rideRequestView, type StoredRideRequest } from './ride-request.js';

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
      if (sandbox.rideRequest && isOpen(sandbox.rideRequest, nowMs)) throw new ConflictException('You already have an open Ride Request.');
      const rideRequest = broadcast(randomUUID(), input, drivers, this.config.dispatch, nowMs, Math.random);
      const winner = firstToAccept(rideRequest);
      const approach = winner && { from: positionAt(winner.driverId, winner.acceptsAtMs), matchedAtMs: winner.acceptsAtMs, route: null };
      const made = { ...rideRequest, approach };
      return { sandbox: { ...sandbox, rideRequest: made }, result: { made, view: rideRequestView(made, null, sandbox.resumedAtMs, nowMs) } };
    });
    // The route is looked for while Drivers decide, and the Rider is not kept waiting for it.
    void this.findRoute(accountId, made);
    return view;
  }

  /** Looks for the matched Driver's route again, if the last search found none. */
  async retryRoute(accountId: string): Promise<void> {
    const again = await this.sandboxes.change(accountId, (sandbox, _drivers, nowMs) => {
      const open = sandbox.rideRequest;
      if (!open || !isOpen(open, nowMs)) throw new ConflictException('You have no open Ride Request.');
      if (open.approach?.route !== 'unavailable') return { sandbox, result: null };
      const rideRequest: StoredRideRequest = { ...open, approach: { ...open.approach, route: null } };
      return { sandbox: { ...sandbox, rideRequest }, result: rideRequest };
    });
    if (again) void this.findRoute(accountId, again);
  }

  private async findRoute(accountId: string, { id, pickup, approach }: StoredRideRequest): Promise<void> {
    if (!approach) return;
    const { lat, lon } = approach.from;
    const route = await this.routeWithRetries({ lat, lon }, pickup);
    await this.sandboxes.amend(accountId, (sandbox, nowMs) => {
      const { rideRequest } = sandbox;
      if (rideRequest?.id !== id || !rideRequest.approach) return sandbox;
      return { ...sandbox, rideRequest: { ...rideRequest, approach: approachRouted(rideRequest.approach, route, nowMs) } };
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
