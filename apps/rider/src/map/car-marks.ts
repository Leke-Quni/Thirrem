import type { Ride, RideRequest } from '@thirrem/types';
import type { CarMark } from './driver-fleet';

/**
 * Which cars show the Ride Request or Ride on the map: all it is offered to while searching, then only the matched Driver's,
 * which is also marked once it has arrived.
 */
export function carMarks(rideRequest: RideRequest | null, ride: Ride | null): Map<string, CarMark> {
  if (ride) return new Map([[ride.driver.id, ride.progress.status === 'arrived' ? 'arrived' : 'matched']]);
  const marks = new Map<string, CarMark>();
  const accepted = rideRequest?.approach?.status === 'arrived' ? 'arrived' : 'matched';
  for (const { driverId, status } of rideRequest?.offers ?? []) {
    if (status !== 'withdrawn') marks.set(driverId, status === 'accepted' ? accepted : 'offered');
  }
  return marks;
}
