import { randomUUID } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CancelWouldPauseResponse, RideRequest, RideRequestsPausedResponse } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { type Coordinate, type RouteResult, RoutingService } from '../routing/routing.service.js';
import { AreaService } from '../sandbox/area.service.js';
import { Pacer } from '../sandbox/pacer.js';
import { releasedDriver } from '../sandbox/sandbox-driver.js';
import type { Sandbox } from '../sandbox/sandbox.repository.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { approachPosition, approachRouted } from './approach.js';
import { CancelHistoryRepository, recordCancel } from './cancel-history.repository.js';
import { cancellation, pausedForS } from './cancel-limit.js';
import { broadcast, cancelling, firstToAccept, isOpen, matchedDriverId, type RideRequestInput, rideRequestView, type StoredRideRequest } from './ride-request.js';

/** How long to wait before each further try, when the routing server cannot be had. */
const ROUTE_RETRY_AFTER_MS = [2_000, 5_000];

const WOULD_PAUSE: CancelWouldPauseResponse = { code: 'CANCEL_WOULD_PAUSE', message: 'Cancelling now would pause your Ride Requests for 15 minutes.' };

function requestsPaused(forS: number): HttpException {
  const minutes = Math.ceil(forS / 60);
  const body: RideRequestsPausedResponse = {
    code: 'RIDE_REQUESTS_PAUSED',
    message: `Ride Requests are paused after too many cancellations. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  };
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}

function openRideRequest({ rideRequest }: Sandbox, nowMs: number): StoredRideRequest {
  if (!rideRequest || !isOpen(rideRequest, nowMs)) throw new ConflictException('You have no open Ride Request.');
  return rideRequest;
}

@Injectable()
export class RideRequestService {
  constructor(
    private readonly sandboxes: SandboxService,
    private readonly routing: RoutingService,
    private readonly pacer: Pacer,
    private readonly areas: AreaService,
    private readonly cancels: CancelHistoryRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async request(accountId: string, input: RideRequestInput): Promise<RideRequest> {
    const { made, view } = await this.sandboxes.change(accountId, async (sandbox, drivers, nowMs, positionAt) => {
      if (sandbox.rideRequest && isOpen(sandbox.rideRequest, nowMs)) throw new ConflictException('You already have an open Ride Request.');
      const history = await this.cancels.findByAccount(accountId);
      const paused = pausedForS(history, nowMs);
      if (paused) throw requestsPaused(paused);
      const rideRequest = broadcast(randomUUID(), input, drivers, this.config.dispatch, nowMs, Math.random);
      const winner = firstToAccept(rideRequest);
      const approach = winner && { from: positionAt(winner.driverId, winner.acceptsAtMs), matchedAtMs: winner.acceptsAtMs, route: null };
      const made = { ...rideRequest, approach };
      return { sandbox: { ...sandbox, rideRequest: made }, result: { made, view: rideRequestView(made, null, history, sandbox.resumedAtMs, nowMs) } };
    });
    // The route is looked for while Drivers decide, and the Rider is not kept waiting for it.
    void this.findRoute(accountId, made);
    return view;
  }

  /** Drops the open Ride Request. A matched Driver is released where it is. One that pauses Ride Requests needs `pauseAccepted`, so the Rider is never paused unwarned. */
  async cancel(accountId: string, pauseAccepted: boolean): Promise<void> {
    const path = await this.sandboxes.change(accountId, async (sandbox, _drivers, nowMs) => {
      const open = openRideRequest(sandbox, nowMs);
      const asked = cancelling(open, nowMs);
      if (!pauseAccepted && cancellation(asked, await this.cancels.findByAccount(accountId), nowMs).pausesRequests) throw new ConflictException(WOULD_PAUSE);
      await recordCancel(this.cancels, accountId, asked, nowMs);
      const matchedId = matchedDriverId(open, nowMs);
      const drivers = sandbox.drivers.map((driver) =>
        driver.id === matchedId && open.approach ? releasedDriver(driver, sandbox.area, approachPosition(open.approach, sandbox.resumedAtMs, nowMs)) : driver,
      );
      const released = drivers.find((driver) => driver.id === matchedId);
      return { sandbox: { ...sandbox, drivers, rideRequest: undefined }, result: released?.own };
    });
    if (path) this.areas.keepFetching(path);
  }

  /** Looks for the matched Driver's route again, if the last search found none. */
  async retryRoute(accountId: string): Promise<void> {
    const again = await this.sandboxes.change(accountId, (sandbox, _drivers, nowMs) => {
      const open = openRideRequest(sandbox, nowMs);
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
