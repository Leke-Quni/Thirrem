import { describe, expect, it } from 'vitest';
import { CachingPlaceSearchService } from '../src/places/caching-place-search.service.js';
import { FakePlaceSearchService } from './support/fake-places.js';

const places = [{ name: 'Rruga Bajram Curri', detail: 'Gjakovë, Kosovo', lat: 42.38, lon: 20.43 }];

describe('CachingPlaceSearchService', () => {
  it('asks once for the same text, ignoring letter case and spaces around it', async () => {
    const inner = new FakePlaceSearchService(places);
    const cached = new CachingPlaceSearchService(inner);

    await cached.search('Bajram Curri');
    await cached.search('  bajram curri ');

    expect(inner.searches).toHaveLength(1);
  });

  it('asks again when the Rider is somewhere else, because nearby results differ', async () => {
    const inner = new FakePlaceSearchService(places);
    const cached = new CachingPlaceSearchService(inner);

    await cached.search('Bajram Curri', { lat: 42.38, lon: 20.43 });
    await cached.search('Bajram Curri', { lat: 51.5, lon: -0.12 });

    expect(inner.searches).toHaveLength(2);
  });

  it('does not remember failures', async () => {
    const inner = new FakePlaceSearchService(new Error('down'));
    const cached = new CachingPlaceSearchService(inner);

    await expect(cached.search('Bajram')).rejects.toThrow();
    await expect(cached.search('Bajram')).rejects.toThrow();

    expect(inner.searches).toHaveLength(2);
  });

  it('asks once for pins about ten metres apart, and remembers a street with no name too', async () => {
    const inner = new FakePlaceSearchService(places, null);
    const cached = new CachingPlaceSearchService(inner);

    expect(await cached.streetAt({ lat: 42.38031, lon: 20.43081 })).toBeNull();
    expect(await cached.streetAt({ lat: 42.380312, lon: 20.430812 })).toBeNull();

    expect(inner.lookups).toHaveLength(1);
  });
});
