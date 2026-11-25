import type { Coordinate } from '@thirrem/types';
import { type Area, SAME_PLACE_M } from './area.js';
import { AreaRepository } from './area.repository.js';
import { distanceM } from './driver-placement.js';

export class InMemoryAreaRepository extends AreaRepository {
  /** Least recently used first. */
  private readonly areas = new Set<Area>();

  constructor(private readonly capacity = 100) {
    super();
  }

  async findNear(centre: Coordinate): Promise<Area | null> {
    const found = [...this.areas].find((area) => distanceM(area.centre, centre) <= SAME_PLACE_M);
    if (!found) return null;
    this.areas.delete(found);
    this.areas.add(found);
    return found;
  }

  async save(area: Area): Promise<Area[]> {
    this.areas.add(area);
    const dropped = [...this.areas].slice(0, Math.max(0, this.areas.size - this.capacity));
    for (const old of dropped) this.areas.delete(old);
    return dropped;
  }
}
