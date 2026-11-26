import type { Fare, FareQuote, VehicleType } from '@thirrem/types';
import { VEHICLE_TYPES } from '../vehicle-types.js';
import type { FareRates, VehicleRate } from './fare-rates.js';

export interface Trip {
  distanceM: number;
  durationS: number;
}

// Summed in 1/3000 of a cent, a unit both metres and seconds divide into, so only the total is rounded.
function amountCents(rate: VehicleRate, thresholdM: number, { distanceM, durationS }: Trip): number {
  const longDistanceM = Math.max(0, distanceM - thresholdM);
  const total = rate.baseCents * 3000 + (rate.perKmCents * distanceM + rate.longDistancePerKmCents * longDistanceM) * 3 + rate.perMinCents * durationS * 50;
  return Math.round(total / 3000);
}

export function calculateFare(rates: FareRates, vehicleType: VehicleType, trip: Trip): Fare {
  return { amountCents: amountCents(rates.vehicleTypes[vehicleType], rates.longDistanceThresholdM, trip), currency: 'EUR' };
}

export function calculateFares(rates: FareRates, trip: Trip): FareQuote[] {
  return VEHICLE_TYPES.map((vehicleType) => ({ vehicleType, ...calculateFare(rates, vehicleType, trip) }));
}
