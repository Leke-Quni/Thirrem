import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PhotonPlaceSearchService } from '../src/places/photon-place-search.service.js';

describe('PhotonPlaceSearchService', () => {
  let server: Server;
  let baseUrl: string;
  let lastUrl = new URL('http://x/');
  let lastUserAgent: string | undefined;
  let reply: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    server = createServer((req, res) => {
      lastUrl = new URL(req.url ?? '/', 'http://x');
      lastUserAgent = req.headers['user-agent'];
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('asks for a few matches near the Rider and maps street and place results to names and coordinates', async () => {
    reply = {
      status: 200,
      body: {
        features: [
          { geometry: { coordinates: [20.4308, 42.3803] }, properties: { name: 'Rruga Bajram Curri', city: 'Gjakovë', country: 'Kosovo' } },
          { geometry: { coordinates: [20.43, 42.38] }, properties: { street: 'Rruga Nëna Terezë', housenumber: '4', city: 'Gjakovë', country: 'Kosovo' } },
        ],
      },
    };

    const result = await new PhotonPlaceSearchService(baseUrl).search('Bajram Curri', { lat: 42.38, lon: 20.43 });

    expect(lastUrl.pathname).toBe('/api/');
    expect(lastUrl.searchParams.get('q')).toBe('Bajram Curri');
    expect(lastUrl.searchParams.get('lat')).toBe('42.38');
    expect(lastUrl.searchParams.get('lon')).toBe('20.43');
    expect(lastUrl.searchParams.get('limit')).toBe('15');
    expect(result).toEqual([
      { name: 'Rruga Nëna Terezë 4', detail: 'Gjakovë, Kosovo', lat: 42.38, lon: 20.43 },
      { name: 'Rruga Bajram Curri', detail: 'Gjakovë, Kosovo', lat: 42.3803, lon: 20.4308 },
    ]);
  });

  const feature = (name: string, city: string, lon: number, lat: number) => ({ geometry: { coordinates: [lon, lat] }, properties: { name, city, country: 'Kosovo' } });

  it('puts the closest match to the Rider first, even when the server ranks a far one higher', async () => {
    reply = {
      status: 200,
      body: {
        features: [
          feature('Bajram Curri', 'Bajram Curri', 20.0766, 42.3573),
          feature('Bajram Curri', 'Gjakova', 20.4322, 42.3791),
          feature('Bajram Curri', 'Krushë e Madhe', 20.3, 42.3),
        ],
      },
    };

    const result = await new PhotonPlaceSearchService(baseUrl).search('Bajram Curri', { lat: 42.3803, lon: 20.4308 });

    expect(result.map((place) => place.detail)).toEqual(['Gjakova, Kosovo', 'Krushë e Madhe, Kosovo', 'Bajram Curri, Kosovo']);
  });

  it('returns only the five closest of the matches it asked for', async () => {
    reply = { status: 200, body: { features: Array.from({ length: 12 }, (_, i) => feature(`Street ${i}`, 'Gjakova', 20.43 + (11 - i) * 0.01, 42.38)) } };

    const result = await new PhotonPlaceSearchService(baseUrl).search('Street', { lat: 42.38, lon: 20.43 });

    expect(result.map((place) => place.name)).toEqual(['Street 11', 'Street 10', 'Street 9', 'Street 8', 'Street 7']);
  });

  it('keeps the server ranking and asks for five when there is no location to measure from', async () => {
    reply = { status: 200, body: { features: [feature('Far', 'A', 30, 50), feature('Near', 'B', 20.43, 42.38)] } };

    const result = await new PhotonPlaceSearchService(baseUrl).search('x1x');

    expect(lastUrl.searchParams.get('limit')).toBe('5');
    expect(result.map((place) => place.name)).toEqual(['Far', 'Near']);
  });

  it('identifies itself to the search server, as public servers ask', async () => {
    reply = { status: 200, body: { features: [] } };

    await new PhotonPlaceSearchService(baseUrl).search('Bajram');

    expect(lastUserAgent).toMatch(/^thirrem-demo/);
  });

  it('skips results that have no name to show', async () => {
    reply = { status: 200, body: { features: [{ geometry: { coordinates: [1, 2] }, properties: { country: 'Kosovo' } }] } };

    expect(await new PhotonPlaceSearchService(baseUrl).search('x1')).toEqual([]);
  });

  it('fails loudly when the search server errors, so it is not mistaken for no matches', async () => {
    reply = { status: 500, body: {} };

    await expect(new PhotonPlaceSearchService(baseUrl).search('Bajram')).rejects.toThrow();
  });

  describe('streetAt', () => {
    it('asks for the nearest object within about a hundred metres and returns its street and city', async () => {
      reply = { status: 200, body: { features: [{ geometry: { coordinates: [20.4308, 42.3803] }, properties: { street: 'Nëna Terezë', housenumber: '302', city: 'Gjakova' } }] } };

      const street = await new PhotonPlaceSearchService(baseUrl).streetAt({ lat: 42.3803, lon: 20.4308 });

      expect(lastUrl.pathname).toBe('/reverse');
      expect(lastUrl.searchParams.get('lat')).toBe('42.3803');
      expect(lastUrl.searchParams.get('lon')).toBe('20.4308');
      expect(lastUrl.searchParams.get('radius')).toBe('0.1');
      expect(street).toBe('Nëna Terezë, Gjakova');
    });

    it('uses the name of the road itself when the nearest object is a road', async () => {
      reply = { status: 200, body: { features: [{ geometry: { coordinates: [1, 2] }, properties: { name: 'Kel Marubi', osm_key: 'highway', city: 'Bishtazhin' } }] } };

      expect(await new PhotonPlaceSearchService(baseUrl).streetAt({ lat: 2, lon: 1 })).toBe('Kel Marubi, Bishtazhin');
    });

    it('does not mistake a shop or building name for a street name', async () => {
      reply = { status: 200, body: { features: [{ geometry: { coordinates: [1, 2] }, properties: { name: 'Hotel Roma', osm_key: 'tourism', city: 'Gjakova' } }] } };

      expect(await new PhotonPlaceSearchService(baseUrl).streetAt({ lat: 2, lon: 1 })).toBeNull();
    });

    it('returns null where nothing is found, and fails loudly when the server errors', async () => {
      reply = { status: 200, body: { features: [] } };
      expect(await new PhotonPlaceSearchService(baseUrl).streetAt({ lat: 0, lon: 0 })).toBeNull();

      reply = { status: 500, body: {} };
      await expect(new PhotonPlaceSearchService(baseUrl).streetAt({ lat: 0, lon: 0 })).rejects.toThrow();
    });
  });
});
