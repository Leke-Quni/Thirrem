import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Coordinate, DriverCar, DriverSandboxResponse, VehicleType } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { VehicleService } from '../onboarding/vehicle.service.js';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { SAME_PLACE_M } from './area.js';
import { distanceM } from './driver-placement.js';
import { type DriverSandbox, DriverSandboxRepository } from './driver-sandbox.repository.js';
import { RoadService } from './road-service.js';
import { sandboxBusy } from './sandbox-busy.js';
import { discardCutoffMs, runningCutoffMs, sandboxStatus } from './sandbox-lifecycle.js';

/** Roughly 100 m north. The road service works on two points or more, and only the first one's answer is used. */
const AHEAD_DEGREES = 0.0009;

@Injectable()
export class DriverSandboxService {
  constructor(
    private readonly sandboxes: DriverSandboxRepository,
    private readonly vehicles: VehicleService,
    private readonly roads: RoadService,
    private readonly clock: SimulationClock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The Driver's Sandbox around `centre`, running. Only an approved Driver has one. */
  async open(accountId: string, centre: Coordinate): Promise<DriverSandboxResponse> {
    const vehicle = await this.vehicles.find(accountId);
    if (vehicle?.status !== 'approved') throw new ForbiddenException('Your application has to be approved before you get a Sandbox.');
    const kept = await this.kept(accountId);
    const reused = kept && distanceM(kept.centre, centre) <= SAME_PLACE_M ? kept : null;
    // Checked before placing too, so that a Driver who will be turned away costs the road service nothing.
    if (!reused && !(await this.sandboxes.hasRoom(accountId, runningCutoffMs(this.nowMs()), this.config.sandboxLimit))) throw sandboxBusy();
    const placed = reused ?? { centre, car: await this.park(centre, vehicle.vehicleType) };
    const now = this.nowMs();
    const sandbox: DriverSandbox = { centre: placed.centre, car: placed.car, lastActiveMs: now };
    if (!(await this.sandboxes.saveIfRoom(accountId, sandbox, runningCutoffMs(now), this.config.sandboxLimit))) throw sandboxBusy();
    return { status: 'running', car: sandbox.car };
  }

  /** The Driver's Sandbox as it is now, or null if they have none. Reading it is not activity. */
  async read(accountId: string): Promise<DriverSandboxResponse | null> {
    const sandbox = await this.sandboxes.findByAccount(accountId);
    if (!sandbox) return null;
    const status = sandboxStatus(sandbox.lastActiveMs, this.nowMs());
    return status === 'discarded' ? null : { status, car: sandbox.car };
  }

  discardExpired(): Promise<void> {
    return this.sandboxes.deleteIdleSince(discardCutoffMs(this.nowMs()));
  }

  private async kept(accountId: string): Promise<DriverSandbox | null> {
    const sandbox = await this.sandboxes.findByAccount(accountId);
    return sandbox && sandboxStatus(sandbox.lastActiveMs, this.nowMs()) !== 'discarded' ? sandbox : null;
  }

  /** The car on the street nearest `centre`, facing along it. Without the road service it still appears, at `centre`. */
  private async park(centre: Coordinate, vehicleType: VehicleType): Promise<DriverCar> {
    const onRoad = await this.roads.snap([centre, { ...centre, lat: centre.lat + AHEAD_DEGREES }]).catch(() => null);
    const headings = onRoad && (await this.roads.headings(onRoad).catch(() => null));
    const { lat, lon } = onRoad?.[0] ?? centre;
    return { lat, lon, heading: headings?.[0] ?? 0, vehicleType };
  }

  private nowMs(): number {
    return this.clock.now().getTime();
  }
}
