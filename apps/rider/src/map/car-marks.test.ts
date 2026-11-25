import type { Ride, RideRequest, RideRequestOffer } from '@thirrem/types';
import { describe, expect, it } from 'vitest';
import { carMarks } from './car-marks';

const rideRequest = (offers: RideRequestOffer[]): RideRequest => ({
  id: 'request',
  vehicleType: 'economy',
  pickup: { lat: 42.38, lon: 20.43 },
  dropoff: { lat: 42.39, lon: 20.44 },
  status: 'searching',
  offers,
  driver: null,
  approach: null,
  cancellation: null,
});

describe('carMarks', () => {
  it('marks nothing without a Ride Request', () => {
    expect(carMarks(null, null).size).toBe(0);
  });

  it('marks every Driver the Ride Request is offered to', () => {
    const marks = carMarks(rideRequest([{ driverId: 'a', status: 'offered' }, { driverId: 'b', status: 'offered' }]), null);

    expect([...marks]).toEqual([['a', 'offered'], ['b', 'offered']]);
  });

  it('marks only the matched Driver once the others have had it withdrawn', () => {
    const marks = carMarks(rideRequest([{ driverId: 'a', status: 'withdrawn' }, { driverId: 'b', status: 'accepted' }]), null);

    expect([...marks]).toEqual([['b', 'matched']]);
  });

  it('marks the matched Driver as arrived once waiting at the Pickup Point', () => {
    const marks = carMarks({ ...rideRequest([{ driverId: 'a', status: 'withdrawn' }, { driverId: 'b', status: 'accepted' }]), approach: { status: 'arrived' } }, null);

    expect([...marks]).toEqual([['b', 'arrived']]);
  });

  it.each([
    ['matched', { status: 'driving', geometry: [], etaS: 60 }],
    ['arrived', { status: 'arrived' }],
  ] as const)("marks the Ride's Driver as %s", (mark, progress) => {
    const marks = carMarks(null, { driver: { id: 'b' }, progress } as unknown as Ride);

    expect([...marks]).toEqual([['b', mark]]);
  });
});
