import type { DriveProgress, Ride, RideRequest } from '@thirrem/types';
import { describe, expect, it } from 'vitest';
import { drivingRoute, lineFromCar } from './approach-route';

const geometry: Array<[number, number]> = [[20.43, 42.39], [20.43, 42.38]];
const rideRequest = (approach: DriveProgress | null) => ({ approach, driver: { id: 'matched' } }) as RideRequest;
const ride = (progress: DriveProgress) => ({ progress, driver: { id: 'matched' } }) as Ride;

describe('drivingRoute', () => {
  it('is the road still ahead of the matched Driver on the way to the Pickup Point', () => {
    expect(drivingRoute(rideRequest({ status: 'driving', geometry, etaS: 90 }), null)).toEqual({ driverId: 'matched', ahead: geometry });
  });

  it('is the road still ahead to the Drop-off Point during a Ride', () => {
    expect(drivingRoute(null, ride({ status: 'driving', geometry, etaS: 90 }))).toEqual({ driverId: 'matched', ahead: geometry });
  });

  it.each<DriveProgress>([{ status: 'routing' }, { status: 'unavailable' }, { status: 'arrived' }])('is none while the drive is $status', (progress) => {
    expect(drivingRoute(rideRequest(progress), null)).toBeNull();
    expect(drivingRoute(null, ride(progress))).toBeNull();
  });

  it('is none while searching, or without a Ride Request', () => {
    expect(drivingRoute(rideRequest(null), null)).toBeNull();
    expect(drivingRoute(null, null)).toBeNull();
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
