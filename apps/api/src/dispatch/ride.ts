import type { MatchedDriver, Ride } from '@thirrem/types';
import type { PathPosition } from '../sandbox/road-path.js';
import { driveEnd, driveEndsAtMs, drivePosition, driveProgress, resumedDrive } from './drive.js';
import type { StoredRideRequest } from './ride-request.js';

/**
 * When the matched Driver picks the Rider up: once it has reached the Pickup Point and the Rider has had time to get in.
 * It follows from the clock until a Sandbox that stopped after it keeps it.
 */
function pickupAtMs({ approach, pickedUpAtMs, boardingMs }: StoredRideRequest, resumedAtMs: number): number | undefined {
  return pickedUpAtMs ?? (approach && driveEndsAtMs(approach.route, approach.matchedAtMs, resumedAtMs, boardingMs));
}

/** Whether the Ride Request has become a Ride by `nowMs`. */
export function isPickedUp(rideRequest: StoredRideRequest, resumedAtMs: number, nowMs: number): boolean {
  const atMs = pickupAtMs(rideRequest, resumedAtMs);
  return atMs !== undefined && atMs <= nowMs;
}

/** Where the matched Driver is at `nowMs`: on its way to the Pickup Point, or on the Ride. Undefined without a Driver due to be matched. */
export function matchedDriverPosition(rideRequest: StoredRideRequest, resumedAtMs: number, nowMs: number): PathPosition | undefined {
  const { approach, rideRoute = null } = rideRequest;
  if (!approach) return undefined;
  if (!isPickedUp(rideRequest, resumedAtMs, nowMs)) return drivePosition(approach.route, approach.matchedAtMs, resumedAtMs, nowMs) ?? approach.from;
  // With no route for the Ride, the Driver waits where its approach ended.
  return drivePosition(rideRoute, pickupAtMs(rideRequest, resumedAtMs)!, resumedAtMs, nowMs) ?? driveEnd(approach.route) ?? approach.from;
}

/** The Ride as the Rider is told of it at `nowMs`, which is only once they have been picked up. */
export function rideView(rideRequest: StoredRideRequest, driver: MatchedDriver, resumedAtMs: number, nowMs: number): Ride {
  const { id, vehicleType, pickup, dropoff, rideRoute = null } = rideRequest;
  return { id, vehicleType, pickup, dropoff, driver, progress: driveProgress(rideRoute, pickupAtMs(rideRequest, resumedAtMs)!, resumedAtMs, nowMs) };
}

/** That of a Sandbox that stopped at `stoppedMs`, set to carry on at `nowMs` from where it was. */
export function resumedRideRequest(rideRequest: StoredRideRequest, resumedAtMs: number, stoppedMs: number, nowMs: number): StoredRideRequest {
  const { approach, rideRoute = null } = rideRequest;
  if (!approach) return rideRequest;
  if (!isPickedUp(rideRequest, resumedAtMs, stoppedMs)) {
    return { ...rideRequest, approach: { ...approach, route: resumedDrive(approach.route, approach.matchedAtMs, resumedAtMs, stoppedMs, nowMs) } };
  }
  const pickedUpAtMs = pickupAtMs(rideRequest, resumedAtMs)!;
  return { ...rideRequest, pickedUpAtMs, rideRoute: resumedDrive(rideRoute, pickedUpAtMs, resumedAtMs, stoppedMs, nowMs) };
}
