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

export type RideRequestStatus = 'searching' | 'matched';

/** What a Driver the Ride Request was broadcast to has done with it. */
export interface RideRequestOffer {
  driverId: string;
  /** Withdrawn once another Driver has accepted. */
  status: 'offered' | 'accepted' | 'withdrawn';
}

export interface RideRequest {
  id: string;
  vehicleType: VehicleType;
  pickup: Coordinate;
  dropoff: Coordinate;
  status: RideRequestStatus;
  offers: RideRequestOffer[];
  /** The matched Driver, or null while searching. */
  driver: MatchedDriver | null;
}

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
