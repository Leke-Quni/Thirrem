import type { Area } from '../../src/sandbox/area.js';
import { AreaRepository } from '../../src/sandbox/area.repository.js';

/** Answers every centre with one area, so the test decides where each Driver is parked. */
export class FixedAreaRepository extends AreaRepository {
  constructor(private readonly area: Area) {
    super();
  }

  async findNear(): Promise<Area> {
    return this.area;
  }

  async save(): Promise<Area[]> {
    return [];
  }
}
