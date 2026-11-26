import type { VehicleType } from '@thirrem/types';

export const VEHICLE_MODELS: Record<VehicleType, string[]> = {
  economy: ['Škoda Fabia', 'Volkswagen Polo', 'Dacia Sandero'],
  comfort: ['Volkswagen Passat', 'Škoda Superb', 'Toyota Camry'],
  xl: ['Volkswagen Touran', 'Ford Galaxy', 'Dacia Jogger'],
  electric: ['Tesla Model 3', 'Volkswagen ID.4', 'Hyundai Kona Electric'],
};
export const VEHICLE_COLOURS = ['Black', 'White', 'Silver', 'Grey', 'Blue', 'Red'];

const LETTERS = 'ABDFGHKLMNPRSTVZ';

export const pickFrom = <T>(from: ArrayLike<T>, random: () => number): T => from[Math.floor(random() * from.length)]!;

/** Not the format of any real number plate. */
export function madeUpPlate(random: () => number): string {
  const number = 100 + Math.floor(random() * 900);
  return `TH-${number}-${pickFrom(LETTERS, random)}${pickFrom(LETTERS, random)}`;
}
