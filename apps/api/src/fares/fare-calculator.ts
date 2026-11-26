import type { Fare, FareBreakdown, FareQuote, VehicleType } from '@thirrem/types';
import { VEHICLE_TYPES } from '../vehicle-types.js';
import type { FareRates } from './fare-rates.js';

export interface Trip {
  distanceM: number;
  durationS: number;
}

// Summed in 1/3000 of a cent, a unit both metres and seconds divide into. The running total is what is rounded, so the amounts add up to the Fare rounded once.
export function calculateFareBreakdown(rates: FareRates, vehicleType: VehicleType, { distanceM, durationS }: Trip): FareBreakdown {
  const rate = rates.vehicleTypes[vehicleType];
  const longDistanceM = Math.max(0, distanceM - rates.longDistanceThresholdM);
  let total = 0;
  let roundedCents = 0;
  const part = (units: number) => {
    const before = roundedCents;
    total += units;
    roundedCents = Math.round(total / 3000);
    return roundedCents - before;
  };
  return {
    baseCents: part(rate.baseCents * 3000),
    distanceCents: part(rate.perKmCents * distanceM * 3),
    timeCents: part(rate.perMinCents * durationS * 50),
    longDistanceCents: part(rate.longDistancePerKmCents * longDistanceM * 3),
  };
}

export const breakdownTotal = ({ baseCents, distanceCents, timeCents, longDistanceCents }: FareBreakdown): number => baseCents + distanceCents + timeCents + longDistanceCents;

export function calculateFare(rates: FareRates, vehicleType: VehicleType, trip: Trip): Fare {
  return { amountCents: breakdownTotal(calculateFareBreakdown(rates, vehicleType, trip)), currency: 'EUR' };
}

export function calculateFares(rates: FareRates, trip: Trip): FareQuote[] {
  return VEHICLE_TYPES.map((vehicleType) => ({ vehicleType, ...calculateFare(rates, vehicleType, trip) }));
}
