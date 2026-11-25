import type { Coordinate } from '@thirrem/types';

/** Cells are web map tiles: at 42° north about 450 m across at the smallest level, and 29 km at the largest. */
const SMALLEST_LEVEL = 16;
const LARGEST_LEVEL = 10;

function cellAt({ lat, lon }: Coordinate, level: number): { x: number; y: number } {
  const size = 2 ** level;
  const mercator = Math.asinh(Math.tan((lat * Math.PI) / 180));
  return { x: Math.floor(((lon + 180) / 360) * size), y: Math.floor(((1 - mercator / Math.PI) / 2) * size) };
}

/**
 * Those around `centre` to search, area by area from the narrowest to the widest.
 * Each area is a cell holding `centre`, from the smallest level to the largest, along with its neighbours.
 */
export function searchAreas<T extends Coordinate>(centre: Coordinate, candidates: T[]): T[][] {
  const areas: T[][] = [];
  for (let level = SMALLEST_LEVEL; level >= LARGEST_LEVEL; level -= 1) {
    const middle = cellAt(centre, level);
    const cells = candidates.map((candidate) => ({ candidate, ...cellAt(candidate, level) }));
    areas.push(cells.filter(({ x, y }) => Math.abs(x - middle.x) <= 1 && Math.abs(y - middle.y) <= 1).map(({ candidate }) => candidate));
  }
  return areas;
}
