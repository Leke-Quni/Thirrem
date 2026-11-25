import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { type Area, SAME_PLACE_M } from './area.js';
import { AreaService } from './area.service.js';
import { distanceM } from './driver-placement.js';
import { RiderActivity } from './rider-activity.js';
import { driverAt, resumedDriver, sandboxDriver } from './sandbox-driver.js';
import { sandboxStatus, stoppedAtMs } from './sandbox-lifecycle.js';
import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

@Injectable()
export class SandboxService extends RiderActivity {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly sandboxes: SandboxRepository,
    private readonly areas: AreaService,
    private readonly clock: SimulationClock,
  ) {
    super();
  }

  /**
   * The Drivers of the account's Sandbox around `centre`, where they are now.
   * Changes to one account's Sandbox take turns, so they never place two sets of Drivers.
   */
  async open(accountId: string, centre: Coordinate): Promise<SimulatedDriver[]> {
    const sandbox = await this.inTurn(accountId, () => this.reuseOrPlace(accountId, centre));
    return this.driversOf(sandbox, this.clock.now().getTime());
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

  /** The Drivers of the account's running Sandbox where they are now, or why there are none to show. */
  async drivers(accountId: string): Promise<SimulatedDriver[] | 'stopped' | null> {
    const sandbox = await this.sandboxes.findByAccount(accountId);
    if (!sandbox) return null;
    const now = this.clock.now().getTime();
    return sandboxStatus(sandbox.lastActiveMs, now) === 'running' ? this.driversOf(sandbox, now) : 'stopped';
  }

  private driversOf({ area, drivers, resumedAtMs }: Sandbox, nowMs: number): SimulatedDriver[] {
    return drivers.map((driver) => driverAt(driver, area, resumedAtMs, nowMs));
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

  private async reuseOrPlace(accountId: string, centre: Coordinate): Promise<Sandbox> {
    const existing = await this.sandboxes.findByAccount(accountId);
    const reused = existing && distanceM(existing.centre, centre) <= SAME_PLACE_M;
    const area = reused ? existing.area : await this.areas.areaAt(centre);
    const now = this.clock.now().getTime();
    const sandbox = reused ? this.active(existing, now) : this.create(centre, area, now);
    await this.sandboxes.save(accountId, sandbox);
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
    return { ...sandbox, drivers, lastActiveMs: nowMs, resumedAtMs: nowMs };
  }
}
