import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { SAME_PLACE_M } from './area.js';
import { AreaService } from './area.service.js';
import { distanceM } from './driver-placement.js';
import { driverAt, sandboxDriver } from './sandbox-driver.js';
import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

@Injectable()
export class SandboxService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly sandboxes: SandboxRepository,
    private readonly areas: AreaService,
    private readonly clock: SimulationClock,
  ) {}

  /**
   * The Drivers of the account's Sandbox around `centre`, where they are now.
   * Requests for one account take turns, so they never place two sets of Drivers.
   */
  async open(accountId: string, centre: Coordinate): Promise<SimulatedDriver[]> {
    const sandbox = await this.inTurn(accountId, centre);
    return this.driversOf(sandbox);
  }

  /** The Drivers of the account's Sandbox where they are now, or null when it has none. */
  async drivers(accountId: string): Promise<SimulatedDriver[] | null> {
    const sandbox = await this.sandboxes.findByAccount(accountId);
    return sandbox && this.driversOf(sandbox);
  }

  private driversOf({ area, drivers }: Sandbox): SimulatedDriver[] {
    const now = this.clock.now().getTime();
    return drivers.map((driver) => driverAt(driver, area, now));
  }

  private inTurn(accountId: string, centre: Coordinate): Promise<Sandbox> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.reuseOrPlace(accountId, centre));
    this.queues.set(accountId, next);
    const leave = () => {
      if (this.queues.get(accountId) === next) this.queues.delete(accountId);
    };
    void next.then(leave, leave);
    return next;
  }

  private async reuseOrPlace(accountId: string, centre: Coordinate): Promise<Sandbox> {
    const existing = await this.sandboxes.findByAccount(accountId);
    if (existing && distanceM(existing.centre, centre) <= SAME_PLACE_M) {
      this.areas.keepFetching(existing.area);
      return existing;
    }
    const area = await this.areas.areaAt(centre);
    const now = this.clock.now().getTime();
    const sandbox = { centre, area, drivers: area.stations.map((_, station) => sandboxDriver(randomUUID(), station, area, now, Math.random)) };
    await this.sandboxes.save(accountId, sandbox);
    this.areas.keepFetching(area);
    return sandbox;
  }
}
