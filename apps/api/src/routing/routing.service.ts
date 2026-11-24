export interface Coordinate {
  lat: number;
  lon: number;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: Array<[number, number]>;
}

export abstract class RoutingService {
  abstract route(from: Coordinate, to: Coordinate): Promise<RouteResult | null>;
}
