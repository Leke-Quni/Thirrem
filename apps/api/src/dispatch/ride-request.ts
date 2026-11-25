import type { Coordinate, MatchedDriver, RideRequest, SimulatedDriver, VehicleType } from '@thirrem/types';
import { approachView, type StoredApproach } from './approach.js';
import { searchArea } from './quadtree.js';

export interface RideRequestInput {
  pickup: Coordinate;
  dropoff: Coordinate;
  vehicleType: VehicleType;
}

/** A Ride Request as a Sandbox keeps it. */
export interface StoredRideRequest extends RideRequestInput {
  id: string;
  /** The Drivers it was broadcast to, and when each of them accepts. */
  offers: Array<{ driverId: string; acceptsAtMs: number }>;
  /** That of the Driver due to accept first, if any Driver was asked. It starts as that Driver is matched. */
  approach?: StoredApproach;
}

export interface Dispatch {
  minDrivers: number;
  acceptAfterMs: { min: number; max: number };
}

/** A new Ride Request, broadcast to the Available Drivers of its Vehicle Type around the Pickup Point. */
export function broadcast(id: string, input: RideRequestInput, drivers: SimulatedDriver[], { minDrivers, acceptAfterMs: { min, max } }: Dispatch, nowMs: number, random: () => number): StoredRideRequest {
  const suitable = drivers.filter((driver) => driver.available && driver.vehicleType === input.vehicleType);
  const offers = searchArea(input.pickup, suitable, minDrivers).map((driver) => ({ driverId: driver.id, acceptsAtMs: nowMs + min + random() * (max - min) }));
  return { ...input, id, offers };
}

/** The offer that is accepted before any other, if there are any. */
export function firstToAccept({ offers }: StoredRideRequest): StoredRideRequest['offers'][number] | undefined {
  return [...offers].sort((a, b) => a.acceptsAtMs - b.acceptsAtMs)[0];
}

/** The Driver who accepted first, if any has by `nowMs`. The match follows from the clock, so nothing has to tick. */
export function matchedDriverId(rideRequest: StoredRideRequest, nowMs: number): string | undefined {
  const first = firstToAccept(rideRequest);
  return first && first.acceptsAtMs <= nowMs ? first.driverId : undefined;
}

/** The Ride Request as the Rider is told of it. `driver` is the one matched, or null while searching. */
export function rideRequestView(
  { id, vehicleType, pickup, dropoff, offers, approach }: StoredRideRequest,
  driver: MatchedDriver | null,
  resumedAtMs: number,
  nowMs: number,
): RideRequest {
  return {
    id,
    vehicleType,
    pickup,
    dropoff,
    status: driver ? 'matched' : 'searching',
    offers: offers.map(({ driverId }) => ({ driverId, status: !driver ? 'offered' : driverId === driver.id ? 'accepted' : 'withdrawn' })),
    driver,
    approach: driver && approach ? approachView(approach, resumedAtMs, nowMs) : null,
  };
}
