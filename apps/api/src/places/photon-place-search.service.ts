import type { Coordinate } from '../routing/routing.service.js';
import { type Place, PlaceSearchService } from './place-search.service.js';

const RESULTS_SHOWN = 5;
const RESULTS_TO_RANK = 15;
const EARTH_RADIUS_KM = 6371;

function distanceKm(a: Coordinate, b: Coordinate): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; city?: string; country?: string; osm_key?: string };
}

export class PhotonPlaceSearchService extends PlaceSearchService {
  constructor(private readonly baseUrl: string) {
    super();
  }

  async search(query: string, near?: Coordinate): Promise<Place[]> {
    const url = new URL('/api/', this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(near ? RESULTS_TO_RANK : RESULTS_SHOWN));
    url.searchParams.set('lang', 'en');
    if (near) {
      url.searchParams.set('lat', String(near.lat));
      url.searchParams.set('lon', String(near.lon));
    }
    const places = (await this.fetchFeatures(url)).flatMap(toPlace);
    if (!near) return places.slice(0, RESULTS_SHOWN);
    return places.sort((a, b) => distanceKm(near, a) - distanceKm(near, b)).slice(0, RESULTS_SHOWN);
  }

  async streetAt({ lat, lon }: Coordinate): Promise<string | null> {
    const url = new URL('/reverse', this.baseUrl);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('radius', '0.1');
    url.searchParams.set('limit', '3');
    url.searchParams.set('lang', 'en');
    for (const { properties } of await this.fetchFeatures(url)) {
      const street = properties.street ?? (properties.osm_key === 'highway' ? properties.name : undefined);
      if (street) return [street, properties.city].filter(Boolean).join(', ');
    }
    return null;
  }

  private async fetchFeatures(url: URL): Promise<PhotonFeature[]> {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'thirrem-demo (portfolio ride-hailing simulation)' } });
    if (!response.ok) throw new Error(`Photon answered ${response.status}`);
    const body = (await response.json()) as { features?: PhotonFeature[] };
    return body.features ?? [];
  }
}

function toPlace({ geometry, properties }: PhotonFeature): Place[] {
  const street = properties.street ? [properties.street, properties.housenumber].filter(Boolean).join(' ') : undefined;
  const name = properties.name ?? street;
  if (!name) return [];
  const [lon, lat] = geometry.coordinates;
  return [{ name, detail: [properties.city, properties.country].filter(Boolean).join(', '), lat, lon }];
}
