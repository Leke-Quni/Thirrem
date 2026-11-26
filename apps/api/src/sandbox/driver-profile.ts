import type { MatchedDriver, VehicleType } from '@thirrem/types';
import { madeUpPlate, pickFrom, VEHICLE_COLOURS, VEHICLE_MODELS } from '../vehicle-catalogue.js';

/** Who a simulated Driver is, shown to a Rider they are matched with. */
export type DriverProfile = Omit<MatchedDriver, 'id'>;

const FIRST_NAMES = ['Agron', 'Albulena', 'Arben', 'Arta', 'Besnik', 'Blerta', 'Dardan', 'Donika', 'Ermal', 'Fitore', 'Ilir', 'Jehona', 'Luan', 'Mimoza', 'Valon', 'Vjosa'];
const INITIALS = 'ABDFGHKLMNPRSTVZ';

export function driverProfile(vehicleType: VehicleType, random: () => number): DriverProfile {
  const pick = <T>(from: ArrayLike<T>): T => pickFrom(from, random);
  return {
    name: `${pick(FIRST_NAMES)} ${pick(INITIALS)}.`,
    rating: (45 + Math.floor(random() * 6)) / 10,
    vehicle: { model: pick(VEHICLE_MODELS[vehicleType]), colour: pick(VEHICLE_COLOURS), plate: madeUpPlate(random) },
  };
}
