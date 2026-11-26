import type { Coordinate } from '@thirrem/types';

export type StreetLookup = { state: 'loading' } | { state: 'done'; name: string | null };

export function pinText(point: (Coordinate & { label?: string }) | null, street: StreetLookup): string {
  if (!point) return '';
  if (point.label) return point.label;
  if (street.state === 'loading') return 'Finding the street name…';
  return street.name ?? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

/** What a pin is called in the Rider's payment records, which keep no coordinates. Undefined for one with no name. */
export function pinName(point: Coordinate & { label?: string }, street: string | null): string | undefined {
  return point.label ?? street ?? undefined;
}
