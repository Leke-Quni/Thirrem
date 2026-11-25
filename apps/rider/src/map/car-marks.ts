import type { RideRequest } from '@thirrem/types';
import type { CarMark } from './driver-fleet';

/** Which cars show the Ride Request on the map: all it is offered to while searching, then only the matched Driver's. */
export function carMarks(rideRequest: RideRequest | null): Map<string, CarMark> {
  const marks = new Map<string, CarMark>();
  for (const { driverId, status } of rideRequest?.offers ?? []) {
    if (status !== 'withdrawn') marks.set(driverId, status === 'accepted' ? 'matched' : 'offered');
  }
  return marks;
}
