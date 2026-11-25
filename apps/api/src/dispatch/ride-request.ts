import type { Coordinate, MatchedDriver, RideRequest, RideRequestStatus, SimulatedDriver, VehicleType } from '@thirrem/types';
import { searchAreas } from './quadtree.js';

export interface RideRequestInput {
  pickup: Coordinate;
  dropoff: Coordinate;
  vehicleType: VehicleType;
}

/** A Ride Request as a Sandbox keeps it. */
export interface StoredRideRequest extends RideRequestInput {
  id: string;
  /** Its broadcasts, narrowest first. Each follows the one before once that one's accept window has passed. */
  broadcasts: Broadcast[];
}

interface Broadcast {
  startsAtMs: number;
  endsAtMs: number;
  /** The Drivers asked, and when each of them would accept. One who would be too late for the window never does. */
  offers: Array<{ driverId: string; acceptsAtMs: number }>;
}

export interface Dispatch {
  acceptWindowMs: number;
  acceptAfterMs: { min: number; max: number };
}

/**
 * A new Ride Request, to be broadcast to the Available Drivers of its Vehicle Type around the Pickup Point, over a wider area each time nobody accepts.
 * Who is in each area is decided now, from where the Drivers are.
 */
export function broadcast(id: string, input: RideRequestInput, drivers: SimulatedDriver[], { acceptWindowMs, acceptAfterMs: { min, max } }: Dispatch, nowMs: number, random: () => number): StoredRideRequest {
  const suitable = drivers.filter((driver) => driver.available && driver.vehicleType === input.vehicleType);
  const broadcasts = searchAreas(input.pickup, suitable).map((area, index) => {
    const startsAtMs = nowMs + index * acceptWindowMs;
    const offers = area.map((driver) => ({ driverId: driver.id, acceptsAtMs: startsAtMs + min + random() * (max - min) }));
    return { startsAtMs, endsAtMs: startsAtMs + acceptWindowMs, offers };
  });
  return { ...input, id, broadcasts };
}

/** The first acceptance made inside its accept window by `nowMs`, if there is one. It follows from the clock, so nothing has to tick. */
function acceptance({ broadcasts }: StoredRideRequest, nowMs: number): { driverId: string; acceptsAtMs: number } | undefined {
  const accepted = broadcasts.flatMap(({ endsAtMs, offers }) => offers.filter(({ acceptsAtMs }) => acceptsAtMs <= Math.min(nowMs, endsAtMs)));
  return accepted.sort((a, b) => a.acceptsAtMs - b.acceptsAtMs)[0];
}

/** The Driver who accepted first, if any has by `nowMs`. */
export function matchedDriverId(rideRequest: StoredRideRequest, nowMs: number): string | undefined {
  return acceptance(rideRequest, nowMs)?.driverId;
}

/** Failed once the window of the last broadcast has passed with nobody accepting. */
function statusAt(rideRequest: StoredRideRequest, nowMs: number): RideRequestStatus {
  if (acceptance(rideRequest, nowMs)) return 'matched';
  return nowMs < rideRequest.broadcasts.at(-1)!.endsAtMs ? 'searching' : 'failed';
}

export function isOpen(rideRequest: StoredRideRequest, nowMs: number): boolean {
  return statusAt(rideRequest, nowMs) !== 'failed';
}

/** The Ride Request as the Rider is told of it at `nowMs`. `driver` is the one matched, or null if none is. */
export function rideRequestView(rideRequest: StoredRideRequest, driver: MatchedDriver | null, nowMs: number): RideRequest {
  const { id, vehicleType, pickup, dropoff, broadcasts } = rideRequest;
  // A match ends the search, so no broadcast is made after it.
  const searchedUntilMs = acceptance(rideRequest, nowMs)?.acceptsAtMs ?? nowMs;
  const offered = new Set(broadcasts.filter(({ startsAtMs }) => startsAtMs <= searchedUntilMs).flatMap(({ offers }) => offers.map(({ driverId }) => driverId)));
  const status = statusAt(rideRequest, nowMs);
  const unaccepted = status === 'searching' ? 'offered' : 'withdrawn';
  return {
    id,
    vehicleType,
    pickup,
    dropoff,
    status,
    offers: [...offered].map((driverId) => ({ driverId, status: driverId === driver?.id ? 'accepted' : unaccepted })),
    driver,
  };
}
