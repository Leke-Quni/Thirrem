import type { Ride, RideRequest } from '@thirrem/types';
import type { Pose } from './driver-fleet';

/** The matched Driver's way to the Pickup Point, or then the Ride's to the Drop-off Point, drawn in place of the trip's route until they get there. */
export interface DrivingRoute {
  driverId: string;
  /** The road still ahead, starting where the Driver was last reported. */
  ahead: Array<[number, number]>;
}

export function drivingRoute(rideRequest: RideRequest | null, ride: Ride | null): DrivingRoute | null {
  const progress = ride ? ride.progress : rideRequest?.approach;
  const driver = ride ? ride.driver : rideRequest?.driver;
  return driver && progress?.status === 'driving' ? { driverId: driver.id, ahead: progress.geometry } : null;
}

/** The car glides behind its reported position, so the line is started at the car as drawn and shrinks as it drives. */
export function lineFromCar(ahead: Array<[number, number]>, car: Pose | null): Array<[number, number]> {
  return car ? [[car.lon, car.lat], ...ahead] : ahead;
}
