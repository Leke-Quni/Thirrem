import type { Coordinate } from '../routing/routing.service.js';
import { type Place, PlaceSearchService } from './place-search.service.js';

const key = (query: string, near?: Coordinate) =>
  `${query.trim().toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lon.toFixed(1)}` : 'anywhere'}`;

export class CachingPlaceSearchService extends PlaceSearchService {
  private readonly results = new Map<string, Place[]>();
  private readonly streets = new Map<string, string | null>();

  constructor(
    private readonly inner: PlaceSearchService,
    private readonly capacity = 500,
  ) {
    super();
  }

  async search(query: string, near?: Coordinate): Promise<Place[]> {
    const id = key(query, near);
    const known = this.results.get(id);
    if (known) return known;
    const found = await this.inner.search(query.trim(), near);
    this.results.set(id, found);
    if (this.results.size > this.capacity) this.results.delete(this.results.keys().next().value!);
    return found;
  }

  async streetAt(point: Coordinate): Promise<string | null> {
    const id = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
    if (this.streets.has(id)) return this.streets.get(id) ?? null;
    const street = await this.inner.streetAt(point);
    this.streets.set(id, street);
    if (this.streets.size > this.capacity) this.streets.delete(this.streets.keys().next().value!);
    return street;
  }
}
