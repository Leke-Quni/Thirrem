import type { Coordinate, MatchedDriver, RideRequest, RideRequestStatus, SimulatedDriver, VehicleType } from '@thirrem/types';
import type { StoredApproach } from './approach.js';
import { type CancelHistory, type Cancelling, cancellation } from './cancel-limit.js';
import type { Trip } from '../fares/fare-calculator.js';
import { type DriveRoute, driveProgress } from './drive.js';
import { searchAreas } from './quadtree.js';
import { completedRoute, isCompleted, isPickedUp } from './ride.js';

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
  /** That of the Driver due to accept first, if any will. It starts as that Driver is matched. */
  approach?: StoredApproach;
  /** How long the Driver waits at the Pickup Point while the Rider gets in. */
  boardingMs: number;
  /** The road from the Pickup Point to the Drop-off Point. Absent until it is looked for. */
  rideRoute?: DriveRoute;
  /** Set once the Rider has asked the Driver to end the Ride early. */
  endRequested?: boolean;
  /** Kept once a Sandbox has stopped after the pickup. Until then it follows from the approach. */
  pickedUpAtMs?: number;
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
  boardingMs: number;
  /** How long a Driver asked to end a Ride early drives on before stopping. */
  stopMs: number;
}

/**
 * A new Ride Request, to be broadcast to the Available Drivers of its Vehicle Type around the Pickup Point, over a wider area each time nobody accepts.
 * Who is in each area is decided now, from where the Drivers are.
 */
export function broadcast(id: string, input: RideRequestInput, drivers: SimulatedDriver[], { acceptWindowMs, acceptAfterMs: { min, max }, boardingMs }: Dispatch, nowMs: number, random: () => number): StoredRideRequest {
  const suitable = drivers.filter((driver) => driver.available && driver.vehicleType === input.vehicleType);
  const broadcasts = searchAreas(input.pickup, suitable).map((area, index) => {
    const startsAtMs = nowMs + index * acceptWindowMs;
    const offers = area.map((driver) => ({ driverId: driver.id, acceptsAtMs: startsAtMs + min + random() * (max - min) }));
    return { startsAtMs, endsAtMs: startsAtMs + acceptWindowMs, offers };
  });
  return { ...input, id, broadcasts, boardingMs };
}

/** The first acceptance made inside its accept window by `nowMs`, if there is one. It follows from the clock, so nothing has to tick. */
function acceptance({ broadcasts }: StoredRideRequest, nowMs: number): { driverId: string; acceptsAtMs: number } | undefined {
  const accepted = broadcasts.flatMap(({ endsAtMs, offers }) => offers.filter(({ acceptsAtMs }) => acceptsAtMs <= Math.min(nowMs, endsAtMs)));
  return accepted.sort((a, b) => a.acceptsAtMs - b.acceptsAtMs)[0];
}

/** The acceptance that will match it, if nothing else happens. */
export const firstToAccept = (rideRequest: StoredRideRequest) => acceptance(rideRequest, Infinity);

/** The Driver who accepted first, if any has by `nowMs`. */
export function matchedDriverId(rideRequest: StoredRideRequest, nowMs: number): string | undefined {
  return acceptance(rideRequest, nowMs)?.driverId;
}

/** What cancelling it depends on. */
export function cancelling(rideRequest: StoredRideRequest, nowMs: number): Cancelling {
  return { matchedAtMs: acceptance(rideRequest, nowMs)?.acceptsAtMs, routeUnavailable: rideRequest.approach?.route === 'unavailable' };
}

/** Failed once the window of the last broadcast has passed with nobody accepting. */
function statusAt(rideRequest: StoredRideRequest, nowMs: number): RideRequestStatus {
  if (acceptance(rideRequest, nowMs)) return 'matched';
  return nowMs < rideRequest.broadcasts.at(-1)!.endsAtMs ? 'searching' : 'failed';
}

/** Still looking for a Driver, with one, or on the Ride it became: it has neither failed nor completed. */
export function isUnderWay(rideRequest: StoredRideRequest, resumedAtMs: number, nowMs: number): boolean {
  return statusAt(rideRequest, nowMs) !== 'failed' && !isCompleted(rideRequest, resumedAtMs, nowMs);
}

/** A Ride Request is open until the Rider is picked up, or it fails. */
export function isOpen(rideRequest: StoredRideRequest, resumedAtMs: number, nowMs: number): boolean {
  return isUnderWay(rideRequest, resumedAtMs, nowMs) && !isPickedUp(rideRequest, resumedAtMs, nowMs);
}

/** How a Ride Request or its Ride has ended, as far as its Fare goes: the trip to be charged for, or nothing. */
export type JourneyEnd = { charge: Trip } | 'release';

/** How it has ended by `nowMs`, or null while it is under way. It cannot finish once no route is to be had. */
export function journeyEnd(rideRequest: StoredRideRequest, resumedAtMs: number, nowMs: number): JourneyEnd | null {
  const travelled = completedRoute(rideRequest, resumedAtMs, nowMs);
  if (travelled) return { charge: travelled };
  const routeless = rideRequest.approach?.route === 'unavailable' || rideRequest.rideRoute === 'unavailable';
  return routeless || statusAt(rideRequest, nowMs) === 'failed' ? 'release' : null;
}

/** The Ride Request as the Rider is told of it at `nowMs`. `driver` is the one matched, or null if none is. */
export function rideRequestView(rideRequest: StoredRideRequest, driver: MatchedDriver | null, history: CancelHistory, resumedAtMs: number, nowMs: number): RideRequest {
  const { id, vehicleType, pickup, dropoff, broadcasts, approach } = rideRequest;
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
    approach: driver && approach ? driveProgress(approach.route, approach.matchedAtMs, resumedAtMs, nowMs) : null,
    cancellation: status === 'failed' ? null : cancellation(cancelling(rideRequest, nowMs), history, nowMs),
  };
}
