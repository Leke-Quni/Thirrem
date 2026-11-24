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
