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
}

export interface SandboxResponse {
  drivers: SimulatedDriver[];
}
