import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Coordinate } from '@thirrem/types';
import { type Area, SAME_PLACE_M } from './area.js';
import { AreaRepository } from './area.repository.js';
import { candidatePoints, chooseDrivers, distanceM } from './driver-placement.js';
import { PathFetcher } from './path-fetcher.js';
import { RoadService } from './road-service.js';

/** Paths beyond one per Driver, so that Sandboxes sharing an area can drive different ones. */
const EXTRA_PATHS = 20;

@Injectable()
export class AreaService {
  private readonly placing: Array<{ centre: Coordinate; area: Promise<Area> }> = [];

  constructor(
    private readonly areas: AreaRepository,
    private readonly roads: RoadService,
    private readonly paths: PathFetcher,
  ) {}

  /** The saved area around `centre`, or a new one. Riders arriving together share one placement. */
  async areaAt(centre: Coordinate): Promise<Area> {
    const saved = await this.areas.findNear(centre);
    if (saved) return saved;
    const underway = this.placing.find((other) => distanceM(other.centre, centre) <= SAME_PLACE_M);
    if (underway) return underway.area;
    const job = { centre, area: this.place(centre) };
    this.placing.push(job);
    try {
      return await job.area;
    } finally {
      this.placing.splice(this.placing.indexOf(job), 1);
    }
  }

  keepFetching(area: Area): void {
    this.paths.fetch(area);
  }

  private async place(centre: Coordinate): Promise<Area> {
    const candidates = candidatePoints(centre, Math.random);
    // Without the road service the Drivers still appear, just not exactly on a street.
    const onRoad = await this.roads.snap(candidates.map(({ point }) => point)).catch(() => null);
    const parked = chooseDrivers(centre, candidates, onRoad, randomUUID);
    const headings = onRoad && (await this.roads.headings(parked).catch(() => null));
    const stations = parked.map(({ vehicleType, lat, lon }, index) => ({ vehicleType, lat, lon, heading: headings?.[index] ?? Math.floor(Math.random() * 360) }));
    // Every other station gets the second path, which spreads them across all the distance rings.
    const starts = [...stations.keys(), ...Array.from({ length: EXTRA_PATHS }, (_, index) => index * 2)];
    const area: Area = { centre, stations, paths: starts.map((station) => ({ station, ready: null })) };
    // An off-road placement is not kept, so a later Sandbox here can do better.
    if (onRoad) for (const dropped of await this.areas.save(area)) this.paths.forget(dropped);
    return area;
  }
}
