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
 * Those around `centre` to search: the smallest cell holding `centre` and at least `minimum` of them, along with its neighbours.
 * When even the largest cell holds too few, those in it and next to it.
 */
export function searchArea<T extends Coordinate>(centre: Coordinate, candidates: T[], minimum: number): T[] {
  for (let level = SMALLEST_LEVEL; ; level -= 1) {
    const middle = cellAt(centre, level);
    const cells = candidates.map((candidate) => ({ candidate, ...cellAt(candidate, level) }));
    const held = cells.filter(({ x, y }) => x === middle.x && y === middle.y).length;
    if (held >= minimum || level === LARGEST_LEVEL) {
      return cells.filter(({ x, y }) => Math.abs(x - middle.x) <= 1 && Math.abs(y - middle.y) <= 1).map(({ candidate }) => candidate);
    }
  }
}
