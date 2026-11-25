import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Coordinate, SandboxBusyResponse, SandboxResponse, SimulatedDriver } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { isPickedUp, matchedDriverPosition, resumedRideRequest, rideView } from '../dispatch/ride.js';
import { isUnderWay, matchedDriverId, rideRequestView } from '../dispatch/ride-request.js';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { type Area, SAME_PLACE_M } from './area.js';
import { AreaService } from './area.service.js';
import { distanceM } from './driver-placement.js';
import { RiderActivity } from './rider-activity.js';
import { driverAt, resumedDriver, sandboxDriver } from './sandbox-driver.js';
import { discardCutoffMs, runningCutoffMs, sandboxStatus, stoppedAtMs } from './sandbox-lifecycle.js';
import type { PathPosition } from './road-path.js';
import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

const BUSY: SandboxBusyResponse = { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' };
const busy = () => new ServiceUnavailableException(BUSY);

@Injectable()
export class SandboxService extends RiderActivity {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly sandboxes: SandboxRepository,
    private readonly areas: AreaService,
    private readonly clock: SimulationClock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  /**
   * The account's Sandbox around `centre` as it is now. One with an open Ride Request or a Ride is kept wherever the centre is.
   * A `fresh` one replaces any the account has. Changes to one account's Sandbox take turns, so they never place two sets of Drivers.
   */
  async open(accountId: string, centre: Coordinate, fresh = false): Promise<SandboxResponse> {
    const sandbox = await this.inTurn(accountId, () => this.reuseOrPlace(accountId, centre, fresh));
    return this.view(sandbox, this.clock.now().getTime());
  }

  record(accountId: string): Promise<void> {
    // A change already under way records activity itself, and a route request must not wait for Drivers to be placed.
    if (this.queues.has(accountId)) return Promise.resolve();
    return this.inTurn(accountId, async () => {
      const sandbox = await this.sandboxes.findByAccount(accountId);
      const now = this.clock.now().getTime();
      if (sandbox && sandboxStatus(sandbox.lastActiveMs, now) === 'running') await this.sandboxes.save(accountId, this.active(sandbox, now));
    });
  }

  /** The account's running Sandbox as it is now, or why there is nothing to show. */
  async watch(accountId: string): Promise<SandboxResponse | 'stopped' | null> {
    const sandbox = await this.sandboxes.findByAccount(accountId);
    if (!sandbox) return null;
    const now = this.clock.now().getTime();
    const status = sandboxStatus(sandbox.lastActiveMs, now);
    if (status === 'discarded') return null;
    return status === 'running' ? this.view(sandbox, now) : 'stopped';
  }

  /**
   * Changes the account's running Sandbox, which counts as activity.
   * `change` is given its Drivers where they are now, and can ask where one will be later if nothing else happens.
   */
  change<T>(
    accountId: string,
    change: (sandbox: Sandbox, drivers: SimulatedDriver[], nowMs: number, positionAt: (driverId: string, atMs: number) => PathPosition) => { sandbox: Sandbox; result: T },
  ): Promise<T> {
    return this.inTurn(accountId, async () => {
      const found = await this.sandboxes.findByAccount(accountId);
      const now = this.clock.now().getTime();
      if (!found || sandboxStatus(found.lastActiveMs, now) !== 'running') throw new ConflictException('Your Sandbox is not running. Resume it, then try again.');
      const positionAt = (driverId: string, atMs: number) => driverAt(found.drivers.find((driver) => driver.id === driverId)!, found.area, found.resumedAtMs, atMs);
      const { sandbox, result } = change(this.active(found, now), this.view(found, now).drivers, now, positionAt);
      await this.sandboxes.save(accountId, sandbox);
      return result;
    });
  }

  /** Changes the account's Sandbox, if it still has one, with what the server found out for it. The Rider did nothing, so it is not activity. */
  amend(accountId: string, amend: (sandbox: Sandbox, nowMs: number) => Sandbox): Promise<void> {
    return this.inTurn(accountId, async () => {
      const sandbox = await this.sandboxes.findByAccount(accountId);
      if (sandbox) await this.sandboxes.save(accountId, amend(sandbox, this.clock.now().getTime()));
    });
  }

  discardExpired(): Promise<void> {
    return this.sandboxes.deleteIdleSince(discardCutoffMs(this.clock.now().getTime()));
  }

  private view({ area, drivers, resumedAtMs, rideRequest }: Sandbox, nowMs: number): SandboxResponse {
    const matchedId = rideRequest && matchedDriverId(rideRequest, nowMs);
    const matched = drivers.find((driver) => driver.id === matchedId);
    const driver = matched ? { id: matched.id, ...matched.profile } : null;
    // From pickup on, the Rider is told of a Ride in place of the Ride Request.
    const ride = rideRequest && driver && isPickedUp(rideRequest, resumedAtMs, nowMs) ? rideView(rideRequest, driver, resumedAtMs, nowMs) : null;
    return {
      drivers: drivers.map((each) => ({
        ...driverAt(each, area, resumedAtMs, nowMs),
        // The matched Driver has left its path for the Rider.
        ...(each === matched && rideRequest && matchedDriverPosition(rideRequest, resumedAtMs, nowMs)),
        available: each !== matched,
      })),
      rideRequest: rideRequest && !ride ? rideRequestView(rideRequest, driver, resumedAtMs, nowMs) : null,
      ride,
    };
  }

  private inTurn<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(accountId, next);
    const leave = () => {
      if (this.queues.get(accountId) === next) this.queues.delete(accountId);
    };
    void next.then(leave, leave);
    return next;
  }

  private async reuseOrPlace(accountId: string, centre: Coordinate, fresh: boolean): Promise<Sandbox> {
    const existing = fresh ? null : await this.sandboxes.findByAccount(accountId);
    const askedAtMs = this.clock.now().getTime();
    const reused =
      existing &&
      ((existing.rideRequest && isUnderWay(existing.rideRequest, askedAtMs)) || distanceM(existing.centre, centre) <= SAME_PLACE_M) &&
      sandboxStatus(existing.lastActiveMs, askedAtMs) !== 'discarded';
    // Checked before placing too, so that a Rider who will be turned away costs the road service nothing.
    if (!reused && !(await this.sandboxes.hasRoom(accountId, runningCutoffMs(this.clock.now().getTime()), this.config.sandboxLimit))) throw busy();
    const area = reused ? existing.area : await this.areas.areaAt(centre);
    const now = this.clock.now().getTime();
    const sandbox = reused ? this.active(existing, now) : this.create(centre, area, now);
    if (!(await this.sandboxes.saveIfRoom(accountId, sandbox, runningCutoffMs(now), this.config.sandboxLimit))) throw busy();
    this.areas.keepFetching(area);
    return sandbox;
  }

  private create(centre: Coordinate, area: Area, nowMs: number): Sandbox {
    const drivers = area.stations.map((_, station) => sandboxDriver(randomUUID(), station, area, nowMs, Math.random));
    return { centre, area, drivers, lastActiveMs: nowMs, resumedAtMs: nowMs };
  }

  /** The Sandbox with the Rider active at `nowMs`, resumed first if it had stopped. */
  private active(sandbox: Sandbox, nowMs: number): Sandbox {
    if (sandboxStatus(sandbox.lastActiveMs, nowMs) === 'running') return { ...sandbox, lastActiveMs: nowMs };
    const stopped = stoppedAtMs(sandbox.lastActiveMs);
    const drivers = sandbox.drivers.map((driver) => resumedDriver(driver, sandbox.area, sandbox.resumedAtMs, stopped, nowMs));
    const open = sandbox.rideRequest;
    const rideRequest = open && resumedRideRequest(open, sandbox.resumedAtMs, stopped, nowMs);
    return { ...sandbox, drivers, rideRequest, lastActiveMs: nowMs, resumedAtMs: nowMs };
  }
}
