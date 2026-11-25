import type { RideRequest } from '@thirrem/types';
import type { Pose } from './driver-fleet';

/** The matched Driver's way to the Pickup Point, drawn in place of the trip's route until they arrive. */
export interface ApproachRoute {
  driverId: string;
  /** The road still ahead, starting where the Driver was last reported. */
  ahead: Array<[number, number]>;
}

export function approachRoute(rideRequest: RideRequest | null): ApproachRoute | null {
  const { approach, driver } = rideRequest ?? {};
  return driver && approach?.status === 'driving' ? { driverId: driver.id, ahead: approach.geometry } : null;
}

/** The car glides behind its reported position, so the line is started at the car as drawn and shrinks as it drives. */
export function lineFromCar(ahead: Array<[number, number]>, car: Pose | null): Array<[number, number]> {
  return car ? [[car.lon, car.lat], ...ahead] : ahead;
}
