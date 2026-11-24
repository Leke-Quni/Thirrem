import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OsrmRoutingService } from '../src/routing/osrm-routing.service.js';

const from = { lat: 42.3803, lon: 20.4308 };
const to = { lat: 42.3712, lon: 20.4219 };

describe('OsrmRoutingService', () => {
  let server: Server;
  let baseUrl: string;
  let lastPath = '';
  let lastUserAgent: string | undefined;
  let reply: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    server = createServer((req, res) => {
      lastPath = req.url ?? '';
      lastUserAgent = req.headers['user-agent'];
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('asks OSRM for a driving route in longitude,latitude order and maps the answer', async () => {
    reply = {
      status: 200,
      body: {
        code: 'Ok',
        routes: [{ distance: 1850.4, duration: 240.2, geometry: { coordinates: [[20.4308, 42.3803], [20.4219, 42.3712]] } }],
      },
    };

    const result = await new OsrmRoutingService(baseUrl).route(from, to);

    expect(lastPath).toBe('/route/v1/driving/20.4308,42.3803;20.4219,42.3712?overview=full&geometries=geojson');
    expect(result).toEqual({ distanceM: 1850.4, durationS: 240.2, geometry: [[20.4308, 42.3803], [20.4219, 42.3712]] });
  });

  it('identifies itself to the routing server, as public servers ask', async () => {
    reply = { status: 200, body: { code: 'NoRoute', routes: [] } };

    await new OsrmRoutingService(baseUrl).route(from, to);

    expect(lastUserAgent).toMatch(/^thirrem-demo/);
  });

  it('returns null when OSRM finds no route', async () => {
    reply = { status: 200, body: { code: 'NoRoute', routes: [] } };

    expect(await new OsrmRoutingService(baseUrl).route(from, to)).toBeNull();
  });

  it('returns null when a pin cannot be snapped to a road', async () => {
    reply = { status: 400, body: { code: 'NoSegment', message: 'Could not find a matching segment' } };

    expect(await new OsrmRoutingService(baseUrl).route(from, to)).toBeNull();
  });

  it('fails loudly when OSRM is down, so it is not mistaken for "no route"', async () => {
    await expect(new OsrmRoutingService('http://127.0.0.1:1').route(from, to)).rejects.toThrow();
  });
});
