import type { Approach, RideRequest } from '@thirrem/types';
import { describe, expect, it } from 'vitest';
import { approachRoute, lineFromCar } from './approach-route';

const geometry: Array<[number, number]> = [[20.43, 42.39], [20.43, 42.38]];
const rideRequest = (approach: Approach | null) => ({ approach, driver: { id: 'matched' } }) as RideRequest;

describe('approachRoute', () => {
  it('is the road still ahead of the matched Driver on the way to the Pickup Point', () => {
    expect(approachRoute(rideRequest({ status: 'driving', geometry, etaS: 90 }))).toEqual({ driverId: 'matched', ahead: geometry });
  });

  it.each<Approach>([{ status: 'routing' }, { status: 'unavailable' }, { status: 'arrived' }])('is none while the approach is $status', (approach) => {
    expect(approachRoute(rideRequest(approach))).toBeNull();
  });

  it('is none while searching, or without a Ride Request', () => {
    expect(approachRoute(rideRequest(null))).toBeNull();
    expect(approachRoute(null)).toBeNull();
  });
});

describe('lineFromCar', () => {
  it('starts at the car as drawn, which is still on its way to where the road ahead starts', () => {
    expect(lineFromCar(geometry, { lat: 42.391, lon: 20.431, heading: 180 })).toEqual([[20.431, 42.391], ...geometry]);
  });

  it('is the road ahead while the car is not on the map', () => {
    expect(lineFromCar(geometry, null)).toEqual(geometry);
  });
});
