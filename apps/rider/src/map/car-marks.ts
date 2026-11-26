import type { Ride, RideRequest } from '@thirrem/types';
import type { CarMark } from './driver-fleet';

/**
 * Which cars show the Ride Request or Ride on the map: all it is offered to while searching, then only the matched Driver's,
 * which is marked as it arrives and while the Rider is in it.
 */
export function carMarks(rideRequest: RideRequest | null, ride: Ride | null): Map<string, CarMark> {
  if (ride) return new Map([[ride.driver.id, ride.progress.status === 'arrived' ? 'arrived' : 'riding']]);
  const marks = new Map<string, CarMark>();
  const accepted = rideRequest?.approach?.status === 'arrived' ? 'arrived' : 'matched';
  for (const { driverId, status } of rideRequest?.offers ?? []) {
    if (status !== 'withdrawn') marks.set(driverId, status === 'accepted' ? accepted : 'offered');
  }
  return marks;
}
