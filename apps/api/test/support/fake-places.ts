import { type Place, PlaceSearchService } from '../../src/places/place-search.service.js';
import type { Coordinate } from '../../src/routing/routing.service.js';

export class FakePlaceSearchService extends PlaceSearchService {
  readonly searches: Array<{ query: string; near?: Coordinate }> = [];
  readonly lookups: Coordinate[] = [];

  constructor(
    private readonly result: Place[] | Error,
    private readonly street: string | null = null,
  ) {
    super();
  }

  async search(query: string, near?: Coordinate): Promise<Place[]> {
    this.searches.push({ query, near });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }

  async streetAt(point: Coordinate): Promise<string | null> {
    this.lookups.push(point);
    if (this.result instanceof Error) throw this.result;
    return this.street;
  }
}
