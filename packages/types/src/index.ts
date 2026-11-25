export interface HealthResponse {
  status: 'ok';
  database: 'up';
  simulationTime: string;
}

export interface RoadGraphSummary {
  nodes: number;
  edges: number;
}

export interface SessionResponse {
  email: string;
  token: string;
}

export interface MeResponse {
  email: string;
}

export interface RouteResponse {
  distanceM: number;
  durationS: number;
  geometry: Array<[number, number]>;
}

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface PlaceResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export interface StreetResponse {
  street: string | null;
}

export type VehicleType = 'economy' | 'comfort' | 'xl' | 'electric';

export interface FareQuote {
  vehicleType: VehicleType;
  amountCents: number;
  currency: 'EUR';
}

export interface FareResponse {
  distanceM: number;
  durationS: number;
  fares: FareQuote[];
}

export interface SimulatedDriver extends Coordinate {
  id: string;
  vehicleType: VehicleType;
  /** The direction the vehicle faces, in degrees clockwise from north. */
  heading: number;
  /** False while matched to a Ride Request. */
  available: boolean;
}

export interface SandboxResponse {
  drivers: SimulatedDriver[];
  /** The open Ride Request, if the Rider has one. */
  rideRequest: RideRequest | null;
}

/** Failed once every accept window has passed with no Driver accepting. It is then closed. */
export type RideRequestStatus = 'searching' | 'matched' | 'failed';

/** What a Driver the Ride Request was broadcast to has done with it. */
export interface RideRequestOffer {
  driverId: string;
  /** Withdrawn once another Driver has accepted, or the Ride Request has failed. */
  status: 'offered' | 'accepted' | 'withdrawn';
}

export interface RideRequest {
  id: string;
  vehicleType: VehicleType;
  pickup: Coordinate;
  dropoff: Coordinate;
  status: RideRequestStatus;
  offers: RideRequestOffer[];
  /** The matched Driver, or null if none is. */
  driver: MatchedDriver | null;
  /** The matched Driver's drive to the Pickup Point, or null while searching. */
  approach: Approach | null;
}

export type Approach =
  /** The road route is still being looked for, and the Driver waits where it was matched. */
  | { status: 'routing' }
  /** No route could be had. `POST /rider/ride-requests/approach` looks for one again. */
  | { status: 'unavailable' }
  /** `geometry` is the road still ahead, starting where the Driver is. `etaS` is the seconds until it reaches the Pickup Point. */
  | { status: 'driving'; geometry: Array<[number, number]>; etaS: number }
  /** The Driver is waiting at the Pickup Point. */
  | { status: 'arrived' };

export interface MatchedDriver {
  id: string;
  name: string;
  /** Out of 5. */
  rating: number;
  vehicle: { model: string; colour: string; plate: string };
}

/** The 503 answer to opening a Sandbox when as many as are allowed are already running. */
export interface SandboxBusyResponse {
  code: 'SANDBOX_LIMIT';
  message: string;
}

/** What the live feed at `/rider/live` sends, after being told `{ event: 'watch', data: { token } }`. */
export interface SandboxLiveMessage {
  event: 'drivers';
  data: SandboxResponse;
}

/** Why the live feed closes: an unknown session, no Sandbox to watch, no token sent in time, or a stopped Sandbox. */
export type SandboxLiveCloseCode = 4401 | 4404 | 4408 | 4410;
