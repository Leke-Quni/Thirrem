import type { RideRequest, RideRequestOffer } from '@thirrem/types';
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
});

describe('carMarks', () => {
  it('marks nothing without a Ride Request', () => {
    expect(carMarks(null).size).toBe(0);
  });

  it('marks every Driver the Ride Request is offered to', () => {
    const marks = carMarks(rideRequest([{ driverId: 'a', status: 'offered' }, { driverId: 'b', status: 'offered' }]));

    expect([...marks]).toEqual([['a', 'offered'], ['b', 'offered']]);
  });

  it('marks only the matched Driver once the others have had it withdrawn', () => {
    const marks = carMarks(rideRequest([{ driverId: 'a', status: 'withdrawn' }, { driverId: 'b', status: 'accepted' }]));

    expect([...marks]).toEqual([['b', 'matched']]);
  });
});
