import { describe, expect, it } from 'vitest';
import { CachingRoutingService } from '../src/routing/caching-routing.service.js';
import { FakeRoutingService } from './support/fake-routing.js';

const from = { lat: 42.3803, lon: 20.4308 };
const to = { lat: 42.3712, lon: 20.4219 };
const route = { distanceM: 1850, durationS: 240, geometry: [[20.4308, 42.3803], [20.4219, 42.3712]] as Array<[number, number]> };

describe('CachingRoutingService', () => {
  it('asks the routing service once for the same pair of pins, so a public server is not hit twice', async () => {
    const inner = new FakeRoutingService(route);
    const cached = new CachingRoutingService(inner);

    const first = await cached.route(from, to);
    const second = await cached.route({ ...from }, { ...to });

    expect(second).toEqual(first);
    expect(inner.requests).toHaveLength(1);
  });

  it('treats pins about a metre apart as the same request', async () => {
    const inner = new FakeRoutingService(route);
    const cached = new CachingRoutingService(inner);

    await cached.route(from, to);
    await cached.route({ lat: from.lat + 0.000001, lon: from.lon }, to);

    expect(inner.requests).toHaveLength(1);
  });

  it('does not remember failures, so a routing outage is retried', async () => {
    const inner = new FakeRoutingService(new Error('down'));
    const cached = new CachingRoutingService(inner);

    await expect(cached.route(from, to)).rejects.toThrow();
    await expect(cached.route(from, to)).rejects.toThrow();

    expect(inner.requests).toHaveLength(2);
  });

  it('forgets the oldest route once it holds its limit', async () => {
    const inner = new FakeRoutingService(route);
    const cached = new CachingRoutingService(inner, 2);

    await cached.route(from, { lat: 1, lon: 1 });
    await cached.route(from, { lat: 2, lon: 2 });
    await cached.route(from, { lat: 3, lon: 3 });
    await cached.route(from, { lat: 1, lon: 1 });

    expect(inner.requests).toHaveLength(4);
  });
});
