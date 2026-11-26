import { randomUUID } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CancelWouldPauseResponse, RideRequest, RideRequestsPausedResponse } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { calculateFare } from '../fares/fare-calculator.js';
import type { QuotedRide } from '../payments/ride-payment.repository.js';
import { RidePaymentService } from '../payments/ride-payment.service.js';
import { requestedRoute } from '../routing/requested-route.js';
import { type Coordinate, type RouteResult, RoutingService } from '../routing/routing.service.js';
import { AreaService } from '../sandbox/area.service.js';
import { JourneyLedger } from '../sandbox/journey-ledger.js';
import { Pacer } from '../sandbox/pacer.js';
import { releasedDriver } from '../sandbox/sandbox-driver.js';
import type { Sandbox } from '../sandbox/sandbox.repository.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { CancelHistoryRepository, recordCancel } from './cancel-history.repository.js';
import { cancellation, pausedForS } from './cancel-limit.js';
import { routed } from './drive.js';
import { endRequestedRide, isCompleted, isPickedUp, matchedDriverPosition, rideProgress } from './ride.js';
import { broadcast, cancelling, firstToAccept, isOpen, isUnderWay, matchedDriverId, type RideRequestInput, rideRequestView, type StoredRideRequest } from './ride-request.js';

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

/** What the Rider calls the Pickup Point and the Drop-off Point, for their payment records. */
export interface PointNames {
  pickupName: string;
  dropoffName: string;
}

/** The Ride Request that has become a Ride still going at `nowMs`. */
function currentRide({ rideRequest, resumedAtMs }: Sandbox, nowMs: number): StoredRideRequest {
  if (!rideRequest || !isPickedUp(rideRequest, resumedAtMs, nowMs) || isCompleted(rideRequest, resumedAtMs, nowMs)) throw new ConflictException('You are not on a Ride.');
  return rideRequest;
}

function openRideRequest({ rideRequest, resumedAtMs }: Sandbox, nowMs: number): StoredRideRequest {
  if (!rideRequest || !isOpen(rideRequest, resumedAtMs, nowMs)) throw new ConflictException('You have no open Ride Request.');
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
    private readonly payments: RidePaymentService,
    private readonly ledger: JourneyLedger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Holds the quoted Fare, then broadcasts the Ride Request. No Driver is searched for without the hold. */
  async request(accountId: string, input: RideRequestInput, names: PointNames, holdId?: unknown): Promise<RideRequest> {
    const paymentId = this.payments.required ? await this.holdFare(accountId, input, names, holdId) : null;
    const { made, view } = await this.broadcastRequest(accountId, input, paymentId).catch(async (error: unknown) => {
      if (paymentId) await this.payments.abandon(accountId, paymentId);
      throw error;
    });
    // The route is looked for while Drivers decide, and the Rider is not kept waiting for it.
    void this.findRoutes(accountId, made);
    void this.ledger.settle(accountId);
    return view;
  }

  private broadcastRequest(accountId: string, input: RideRequestInput, paymentId: string | null) {
    return this.sandboxes.change(accountId, async (sandbox, drivers, nowMs, positionAt) => {
      const history = await this.assertCanRequest(accountId, sandbox, nowMs);
      const rideRequest = broadcast(randomUUID(), input, drivers, this.config.dispatch, nowMs, Math.random);
      const winner = firstToAccept(rideRequest);
      const approach = winner && { from: positionAt(winner.driverId, winner.acceptsAtMs), matchedAtMs: winner.acceptsAtMs, route: null };
      const made = { ...rideRequest, approach };
      // A completed Ride gives up its place here, so its Fare is noted first.
      await this.ledger.record(accountId, sandbox, nowMs, true);
      if (paymentId && !(await this.payments.attach(paymentId, made.id))) throw new ConflictException('The hold on your Fare has lapsed. Request your Ride again.');
      return { sandbox: { ...sandbox, rideRequest: made }, result: { made, view: rideRequestView(made, null, history, sandbox.resumedAtMs, nowMs) } };
    });
  }

  /** Why the account cannot request a Ride now, if it cannot. Gives its cancel history if it can. */
  private async assertCanRequest(accountId: string, { rideRequest: current, resumedAtMs }: Sandbox, nowMs: number) {
    if (current && isUnderWay(current, resumedAtMs, nowMs)) {
      throw new ConflictException(isPickedUp(current, resumedAtMs, nowMs) ? 'You are already on a Ride.' : 'You already have an open Ride Request.');
    }
    const history = await this.cancels.findByAccount(accountId);
    const paused = pausedForS(history, nowMs);
    if (paused) throw requestsPaused(paused);
    return history;
  }

  /** Holds the quoted Fare, or takes up the hold `holdId` that the Rider's bank has been asked to verify. */
  private async holdFare(accountId: string, input: RideRequestInput, names: PointNames, holdId: unknown): Promise<string> {
    // Nothing is held for a Ride Request that would be refused anyway.
    await this.sandboxes.change(accountId, async (sandbox, _drivers, nowMs) => {
      await this.assertCanRequest(accountId, sandbox, nowMs);
      return { sandbox, result: undefined };
    });
    const quoted = await this.quote(input, names);
    return holdId === undefined ? this.payments.hold(accountId, quoted) : this.payments.confirm(accountId, holdId, quoted);
  }

  /** The quoted Fare, worked out here as the Rider was shown it: for the road route between the two points. */
  private async quote({ pickup, dropoff, vehicleType }: RideRequestInput, names: PointNames): Promise<QuotedRide> {
    const { distanceM, durationS } = await requestedRoute(this.routing, { pickup, dropoff });
    const trip = { distanceM, durationS };
    return { ...names, vehicleType, trip, amountCents: calculateFare(this.config.fareRates, vehicleType, trip).amountCents };
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
        driver.id === matchedId && open.approach ? releasedDriver(driver, sandbox.area, matchedDriverPosition(open, sandbox.resumedAtMs, nowMs)!) : driver,
      );
      const released = drivers.find((driver) => driver.id === matchedId);
      const cancelled = { ...sandbox, drivers, rideRequest: undefined };
      await this.ledger.record(accountId, cancelled, nowMs);
      return { sandbox: cancelled, result: released?.own };
    });
    await this.ledger.settle(accountId);
    if (path) this.areas.keepFetching(path);
  }

  /** Looks for the matched Driver's route again, if the last search found none. */
  async retryRoute(accountId: string, holdId?: unknown): Promise<void> {
    const again = await this.lookAgain(accountId, holdId, (sandbox, nowMs) => {
      const open = openRideRequest(sandbox, nowMs);
      return open.approach?.route === 'unavailable' ? { ...open, approach: { ...open.approach, route: null } } : null;
    });
    if (again) void this.findRoutes(accountId, again);
  }

  /** Looks for the Ride's route to the Drop-off Point again, if the last search found none. */
  async retryRideRoute(accountId: string, holdId?: unknown): Promise<void> {
    const again = await this.lookAgain(accountId, holdId, (sandbox, nowMs) => {
      const current = currentRide(sandbox, nowMs);
      return current.rideRoute === 'unavailable' ? { ...current, rideRoute: null } : null;
    });
    if (again) void this.findRideRoute(accountId, again);
  }

  /**
   * Sets a Ride Request that could not get a route to look for it again, and gives it as it then is, or null if it has nothing to look for.
   * Its hold was released when the search gave up, so the Fare is held again first.
   * `reset` gives the Ride Request ready to look again, or null.
   */
  private async lookAgain(accountId: string, holdId: unknown, reset: (sandbox: Sandbox, nowMs: number) => StoredRideRequest | null): Promise<StoredRideRequest | null> {
    const stuck = await this.sandboxes.change(accountId, async (sandbox, _drivers, nowMs) => {
      const rideRequest = reset(sandbox, nowMs);
      // The release is noted here, in case the API has not got to it.
      if (rideRequest) await this.ledger.record(accountId, sandbox, nowMs);
      return { sandbox, result: rideRequest };
    });
    if (!stuck) return null;
    await this.ledger.settle(accountId);
    const paymentId = this.payments.required ? await this.payments.holdAgain(accountId, stuck.id, holdId) : null;
    try {
      return await this.sandboxes.change(accountId, async (sandbox, _drivers, nowMs) => {
        const rideRequest = reset(sandbox, nowMs);
        if (!rideRequest || rideRequest.id !== stuck.id) throw new ConflictException('Your Ride has moved on. Try again.');
        if (paymentId && !(await this.payments.attach(paymentId, rideRequest.id))) throw new ConflictException('The hold on your Fare has lapsed. Try again.');
        return { sandbox: { ...sandbox, rideRequest }, result: rideRequest };
      });
    } catch (error) {
      if (paymentId) await this.payments.abandon(accountId, paymentId);
      throw error;
    }
  }

  /** Asks the Driver to end the Ride early. The simulated Driver drives on for a short while, then stops. Asking again changes nothing. */
  async endRide(accountId: string): Promise<void> {
    await this.sandboxes.change(accountId, (sandbox, _drivers, nowMs) => {
      const current = currentRide(sandbox, nowMs);
      if (current.endRequested) return { sandbox, result: undefined };
      if (rideProgress(current, sandbox.resumedAtMs, nowMs).status !== 'driving') throw new ConflictException('Your Driver has no route to drive yet.');
      const rideRequest = endRequestedRide(current, sandbox.resumedAtMs, nowMs, this.config.dispatch.stopMs / 1_000);
      return { sandbox: { ...sandbox, rideRequest }, result: undefined };
    });
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
