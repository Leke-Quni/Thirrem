import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import type { Area, AreaPath } from './area.js';
import { turningPoint } from './driver-placement.js';
import { Pacer } from './pacer.js';
import { roadPath } from './road-path.js';
import { RoadService } from './road-service.js';

const BETWEEN_REQUESTS_MS = 1_000;
const MAX_ATTEMPTS = 3;

interface Job {
  path: AreaPath;
  attempts: number;
}

/** Fills in the road paths of areas, one request at a time, with areas taking turns. */
@Injectable()
export class PathFetcher implements OnModuleDestroy {
  private readonly queue = new Map<Area, Job[]>();
  private readonly wanted = new Set<AreaPath>();
  private running = false;
  private stopped = false;

  constructor(
    private readonly roads: RoadService,
    private readonly clock: SimulationClock,
    private readonly pacer: Pacer,
  ) {}

  /** Queues every path of the area that is neither ready nor already queued, including any given up on earlier. */
  fetch(area: Area): void {
    for (const path of area.paths) {
      if (!path.ready && !this.wanted.has(path)) this.enqueue(area, { path, attempts: 0 });
    }
    void this.run();
  }

  forget(area: Area): void {
    for (const { path } of this.queue.get(area) ?? []) this.wanted.delete(path);
    this.queue.delete(area);
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private enqueue(area: Area, job: Job): void {
    this.wanted.add(job.path);
    const jobs = this.queue.get(area);
    if (jobs) jobs.push(job);
    else this.queue.set(area, [job]);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (!this.stopped) {
      const next = this.queue.entries().next().value;
      if (!next) break;
      const [area, jobs] = next;
      const job = jobs.shift()!;
      // Moved to the back of the line, so one area never holds up another.
      this.queue.delete(area);
      if (jobs.length) this.queue.set(area, jobs);
      await this.attempt(area, job);
      await this.pacer.pause(BETWEEN_REQUESTS_MS);
    }
    this.running = false;
  }

  private async attempt(area: Area, { path, attempts }: Job): Promise<void> {
    const { lat, lon } = area.stations[path.station]!;
    const start = { lat, lon };
    const route = await this.roads.route([start, turningPoint(area.centre, start, Math.random), start]).catch(() => null);
    const drivable = route && roadPath(route);
    if (drivable) path.ready = { path: drivable, atMs: this.clock.now().getTime() };
    else if (attempts + 1 < MAX_ATTEMPTS) return this.enqueue(area, { path, attempts: attempts + 1 });
    this.wanted.delete(path);
  }
}
