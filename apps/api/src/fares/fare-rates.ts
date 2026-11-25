import type { VehicleType } from '@thirrem/types';

export interface VehicleRate {
  baseCents: number;
  perKmCents: number;
  perMinCents: number;
  longDistancePerKmCents: number;
}

export interface FareRates {
  /** Each kilometre past this also pays the long-distance rate, which covers the Driver's empty return. */
  longDistanceThresholdM: number;
  vehicleTypes: Record<VehicleType, VehicleRate>;
}

export const FARE_RATES: FareRates = {
  longDistanceThresholdM: 20_000,
  vehicleTypes: {
    economy: { baseCents: 150, perKmCents: 13, perMinCents: 7, longDistancePerKmCents: 85 },
    comfort: { baseCents: 210, perKmCents: 18, perMinCents: 9, longDistancePerKmCents: 110 },
    xl: { baseCents: 270, perKmCents: 25, perMinCents: 12, longDistancePerKmCents: 140 },
    electric: { baseCents: 210, perKmCents: 18, perMinCents: 9, longDistancePerKmCents: 110 },
  },
};
