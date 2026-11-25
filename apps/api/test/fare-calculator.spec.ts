import { describe, expect, it } from 'vitest';
import { calculateFares } from '../src/fares/fare-calculator.js';
import { type FareRates, FARE_RATES } from '../src/fares/fare-rates.js';

const amounts = (distanceM: number, durationS: number, rates: FareRates = FARE_RATES) =>
  calculateFares(rates, { distanceM, durationS }).map((fare) => fare.amountCents);

describe('Fare calculation', () => {
  it('quotes Economy, Comfort, XL and Electric in euros, in that order', () => {
    const fares = calculateFares(FARE_RATES, { distanceM: 2200, durationS: 270 });

    expect(fares).toEqual([
      { vehicleType: 'economy', amountCents: 210, currency: 'EUR' },
      { vehicleType: 'comfort', amountCents: 290, currency: 'EUR' },
      { vehicleType: 'xl', amountCents: 379, currency: 'EUR' },
      { vehicleType: 'electric', amountCents: 290, currency: 'EUR' },
    ]);
  });

  it('charges only the base amount for no distance and no time', () => {
    expect(amounts(0, 0)).toEqual([150, 210, 270, 210]);
  });

  it('adds no surcharge at the long-distance threshold of 20 km', () => {
    expect(amounts(20_000, 0)).toEqual([410, 570, 770, 570]);
  });

  it('adds the surcharge only to the distance past the threshold', () => {
    expect(amounts(21_000, 0)).toEqual([508, 698, 935, 698]);
  });

  it.each([
    [30_000, 2400, [1670, 2210, 2900, 2210]],
    [86_000, 5250, [7491, 9806, 12710, 9806]],
  ])('quotes a long trip of %i m and %i s', (distanceM, durationS, expected) => {
    expect(amounts(distanceM, durationS)).toEqual(expected);
  });

  it('quotes Economy for 75.8 km in 1 h 15 min', () => {
    expect(amounts(75_800, 4500)[0]).toBe(6403);
  });

  it('quotes Comfort and XL for 64 km in 1 h 20 min', () => {
    expect(amounts(64_000, 4800).slice(1, 3)).toEqual([6922, 8990]);
  });

  it('rounds to whole cents once, at the end', () => {
    // 150 + 0.65 (50 m) + 0.7 (6 s) = 151.35 for Economy; rounding each part first would give 152.
    expect(amounts(50, 6)[0]).toBe(151);
  });

  it('follows whatever rates it is given', () => {
    const rates: FareRates = {
      longDistanceThresholdM: 1000,
      vehicleTypes: {
        economy: { baseCents: 100, perKmCents: 10, perMinCents: 5, longDistancePerKmCents: 50 },
        comfort: { baseCents: 200, perKmCents: 20, perMinCents: 10, longDistancePerKmCents: 60 },
        xl: { baseCents: 300, perKmCents: 30, perMinCents: 15, longDistancePerKmCents: 70 },
        electric: { baseCents: 400, perKmCents: 40, perMinCents: 20, longDistancePerKmCents: 80 },
      },
    };

    expect(amounts(2000, 120, rates)).toEqual([180, 320, 460, 600]);
  });
});
