import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Coordinate } from '@thirrem/types';
import { candidatePoints, chooseDrivers, distanceM } from './driver-placement.js';
import { RoadService } from './road-service.js';
import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

const SAME_PLACE_M = 1_000;

@Injectable()
export class SandboxService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly sandboxes: SandboxRepository,
    private readonly roads: RoadService,
  ) {}

  /** The account's Sandbox around `centre`. Requests for one account take turns, so they never place two sets of Drivers. */
  open(accountId: string, centre: Coordinate): Promise<Sandbox> {
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
    if (existing && distanceM(existing.centre, centre) <= SAME_PLACE_M) return existing;
    const candidates = candidatePoints(centre, Math.random);
    // Without the road service the Drivers still appear, just not exactly on a street.
    const onRoad = await this.roads.snap(candidates.map(({ point }) => point)).catch(() => null);
    const parked = chooseDrivers(centre, candidates, onRoad, randomUUID);
    const headings = onRoad && (await this.roads.headings(parked).catch(() => null));
    const sandbox = { centre, drivers: parked.map((driver, index) => ({ ...driver, heading: headings?.[index] ?? Math.floor(Math.random() * 360) })) };
    await this.sandboxes.save(accountId, sandbox);
    return sandbox;
  }
}
