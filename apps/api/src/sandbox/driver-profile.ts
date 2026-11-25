import type { MatchedDriver, VehicleType } from '@thirrem/types';

/** Who a simulated Driver is, shown to a Rider they are matched with. */
export type DriverProfile = Omit<MatchedDriver, 'id'>;

const FIRST_NAMES = ['Agron', 'Albulena', 'Arben', 'Arta', 'Besnik', 'Blerta', 'Dardan', 'Donika', 'Ermal', 'Fitore', 'Ilir', 'Jehona', 'Luan', 'Mimoza', 'Valon', 'Vjosa'];
const INITIALS = 'ABDFGHKLMNPRSTVZ';
const MODELS: Record<VehicleType, string[]> = {
  economy: ['Škoda Fabia', 'Volkswagen Polo', 'Dacia Sandero'],
  comfort: ['Volkswagen Passat', 'Škoda Superb', 'Toyota Camry'],
  xl: ['Volkswagen Touran', 'Ford Galaxy', 'Dacia Jogger'],
  electric: ['Tesla Model 3', 'Volkswagen ID.4', 'Hyundai Kona Electric'],
};
const COLOURS = ['Black', 'White', 'Silver', 'Grey', 'Blue', 'Red'];

export function driverProfile(vehicleType: VehicleType, random: () => number): DriverProfile {
  const pick = <T>(from: ArrayLike<T>): T => from[Math.floor(random() * from.length)]!;
  const number = 100 + Math.floor(random() * 900);
  return {
    name: `${pick(FIRST_NAMES)} ${pick(INITIALS)}.`,
    rating: (45 + Math.floor(random() * 6)) / 10,
    // Not the format of any real number plate.
    vehicle: { model: pick(MODELS[vehicleType]), colour: pick(COLOURS), plate: `TH-${number}-${pick(INITIALS)}${pick(INITIALS)}` },
  };
}
