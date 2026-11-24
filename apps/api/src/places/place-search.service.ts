import type { Coordinate } from '../routing/routing.service.js';

export interface Place {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export abstract class PlaceSearchService {
  abstract search(query: string, near?: Coordinate): Promise<Place[]>;
  abstract streetAt(point: Coordinate): Promise<string | null>;
}
