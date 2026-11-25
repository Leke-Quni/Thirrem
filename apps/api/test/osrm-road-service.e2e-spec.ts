import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OsrmRoadService } from '../src/sandbox/osrm-road-service.js';

const points = [
  { lat: 42.3803, lon: 20.4308 },
  { lat: 42.371234567, lon: 20.421987654 },
];

describe('OsrmRoadService', () => {
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

  const ok = { status: 200, body: { code: 'Ok', destinations: [{ location: [20.4309, 42.3804] }, { location: [20.422, 42.3713] }] } };

  it('snaps every point with one table request, in longitude,latitude order', async () => {
    reply = ok;

    const result = await new OsrmRoadService(baseUrl).snap(points);

    expect(lastPath).toBe('/table/v1/driving/20.430800,42.380300;20.421988,42.371235?sources=0');
    expect(result).toEqual([
      { lat: 42.3804, lon: 20.4309 },
      { lat: 42.3713, lon: 20.422 },
    ]);
  });

  it('identifies itself to the routing server, as public servers ask', async () => {
    reply = ok;

    await new OsrmRoadService(baseUrl).snap(points);

    expect(lastUserAgent).toMatch(/^thirrem-demo/);
  });

  it('fails when OSRM answers with an error or leaves points out', async () => {
    reply = { status: 400, body: { code: 'NoSegment' } };
    await expect(new OsrmRoadService(baseUrl).snap(points)).rejects.toThrow(/NoSegment/);

    reply = { status: 200, body: { code: 'Ok', destinations: [{ location: [20.4309, 42.3804] }] } };
    await expect(new OsrmRoadService(baseUrl).snap(points)).rejects.toThrow();
  });

  it('reads the street direction at each point from one route through them all', async () => {
    const leg = (bearing: number) => ({ steps: [{ maneuver: { bearing_after: bearing, bearing_before: 0 } }, { maneuver: { bearing_after: 0, bearing_before: 200 } }] });
    reply = { status: 200, body: { code: 'Ok', routes: [{ legs: [leg(90), leg(145)] }] } };

    const headings = await new OsrmRoadService(baseUrl).headings([...points, points[0]!]);

    expect(lastPath).toBe('/route/v1/driving/20.430800,42.380300;20.421988,42.371235;20.430800,42.380300?steps=true&overview=false');
    expect(headings).toEqual([90, 145, 200]);
  });

  it('fails when no route gives a direction for every point', async () => {
    reply = { status: 400, body: { code: 'NoRoute' } };

    await expect(new OsrmRoadService(baseUrl).headings(points)).rejects.toThrow(/NoRoute/);
  });

  it('fails when OSRM cannot be reached', async () => {
    await expect(new OsrmRoadService('http://127.0.0.1:1').snap(points)).rejects.toThrow();
  });
});
