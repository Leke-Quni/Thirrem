import type { Coordinate } from '@thirrem/types';

export type StreetLookup = { state: 'loading' } | { state: 'done'; name: string | null };

export function pinText(point: (Coordinate & { label?: string }) | null, street: StreetLookup): string {
  if (!point) return '';
  if (point.label) return point.label;
  if (street.state === 'loading') return 'Finding the street name…';
  return street.name ?? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}
