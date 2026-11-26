import type { VehicleType } from '@thirrem/types';

export const VEHICLE_TYPE_NAMES: Record<VehicleType, string> = { economy: 'Economy', comfort: 'Comfort', xl: 'XL', electric: 'Electric' };

const PAINTS: Record<string, string> = { Black: '#23262d', White: '#f4f6f9', Silver: '#c2c8d1', Grey: '#6d7482', Blue: '#2f6fdb', Red: '#d0433b' };

export const paintOf = (colour: string) => PAINTS[colour] ?? PAINTS.Grey!;
