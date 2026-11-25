import type { Coordinate } from '@thirrem/types';
import type { Area } from './area.js';

export abstract class AreaRepository {
  abstract findNear(centre: Coordinate): Promise<Area | null>;
  /** Returns any area that was dropped to make room. */
  abstract save(area: Area): Promise<Area[]>;
}
