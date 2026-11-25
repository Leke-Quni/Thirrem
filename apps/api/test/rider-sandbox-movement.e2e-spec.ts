import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';
import { FakeRoutingService } from './support/fake-routing.js';
import { InstantPacer, ManualPacer, settle } from './support/pacers.js';
import type { Pacer } from '../src/sandbox/pacer.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...centre, lat: centre.lat + metres / 111_195 });
const PATHS = 60;

describe('Simulated Drivers moving along road paths', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const start = async <P extends Pacer>(pacer: P, roads = new FakeRoadService()) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const app = await createTestApp({ clock, roads, pacer, routing: new FakeRoutingService({ distanceM: 1_000, durationS: 100, geometry: [] }) });
    apps.push(app);
    const rider = async () => {
      const { body } = await request(app.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
      return body.token as string;
    };
    const drivers = async (token: string, at: Coordinate = centre): Promise<SimulatedDriver[]> => {
      const res = await request(app.getHttpServer()).put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send({ centre: at }).expect(200);
      await settle();
      return res.body.drivers;
    };
    return { app, clock, roads, pacer, rider, drivers };
  };
  const fetched = (roads: FakeRoadService, count = PATHS) => vi.waitFor(() => expect(roads.routeRequests.length).toBeGreaterThanOrEqual(count), { interval: 5 });
  /** Waits until a few turns pass without another path being asked for. */
  const quiet = async (roads: FakeRoadService) => {
    for (let asked = -1; asked !== roads.routeRequests.length; ) {
      asked = roads.routeRequests.length;
      for (let turn = 0; turn < 10; turn += 1) await settle();
    }
  };
  const travelled = (before: SimulatedDriver[], after: SimulatedDriver[]) => after.map((driver, index) => distanceM(before[index]!, driver));
  // A Driver that has just turned back can be where it was, so facing another way counts as having moved too.
  const moved = (before: SimulatedDriver[], after: SimulatedDriver[]) =>
    travelled(before, after).filter((metres, index) => metres > 1 || Math.abs(after[index]!.heading - before[index]!.heading) > 1).length;

  it('fetches each path as one loop from where a Driver is parked, out to a turning point and back', async () => {
    const { roads, rider, drivers } = await start(new InstantPacer());

    const parked = await drivers(await rider());
    await fetched(roads);

    const [from, turn, back] = roads.routeRequests[0]!;
    expect(from).toEqual({ lat: parked[0]!.lat, lon: parked[0]!.lon });
    expect(back).toEqual(from);
    for (const [station, turningPoint] of roads.routeRequests) {
      expect(distanceM(station!, turningPoint!)).toBeGreaterThanOrEqual(499);
      expect(distanceM(station!, turningPoint!)).toBeLessThanOrEqual(2_501);
      expect(distanceM(centre, turningPoint!)).toBeLessThanOrEqual(10_001);
    }
  });

  it('fetches 60 paths for an area and then no more', async () => {
    const { roads, rider, drivers } = await start(new InstantPacer());
    const token = await rider();

    await drivers(token);
    await quiet(roads);
    await drivers(token);

    expect(roads.routeRequests).toHaveLength(PATHS);
  });

  it('asks for a new path no sooner than one second after the last', async () => {
    const { roads, pacer, rider, drivers } = await start(new ManualPacer());

    await drivers(await rider());
    expect(roads.routeRequests).toHaveLength(1);
    expect(pacer.pauses).toEqual([1_000]);

    await pacer.step();

    expect(roads.routeRequests).toHaveLength(2);
    expect(pacer.pauses).toEqual([1_000, 1_000]);
  });

  it('starts each Driver as soon as its path is ready, without waiting for the whole set', async () => {
    const { clock, pacer, rider, drivers } = await start(new ManualPacer());
    const token = await rider();
    const parked = await drivers(token);

    clock.advance(10_000);
    const afterOne = await drivers(token);
    expect(moved(parked, afterOne)).toBe(1);

    await pacer.step();
    clock.advance(10_000);
    expect(moved(parked, await drivers(token))).toBe(2);
  });

  it('moves every Driver along its path only as the simulation clock advances', async () => {
    const { clock, roads, rider, drivers } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);
    await fetched(roads);
    const before = await drivers(token);
    expect(await drivers(token)).toEqual(before);

    clock.advance(10_000);
    const after = await drivers(token);

    for (const metres of travelled(before, after)) {
      expect(metres).toBeGreaterThan(80);
      expect(metres).toBeLessThan(120);
    }
    expect(after.map(({ id, vehicleType }) => ({ id, vehicleType }))).toEqual(before.map(({ id, vehicleType }) => ({ id, vehicleType })));
  });

  it('faces each Driver the way it is driving', async () => {
    const { clock, roads, rider, drivers } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);
    await fetched(roads);
    const before = await drivers(token);

    clock.advance(1_000);
    const after = await drivers(token);

    after.forEach((driver, index) => {
      const from = before[index]!;
      const course = (Math.atan2((driver.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180), driver.lat - from.lat) * 180) / Math.PI;
      expect(Math.abs(((driver.heading - course + 540) % 360) - 180)).toBeLessThan(1);
    });
  });

  it('serves a later Sandbox in the same area from the saved paths, with no new routing requests', async () => {
    const { clock, roads, rider, drivers } = await start(new InstantPacer());
    await drivers(await rider());
    await fetched(roads);
    const asked = () => [roads.requests.length, roads.headingRequests.length, roads.routeRequests.length];
    const before = asked();

    const later = await rider();
    const first = await drivers(later, north(900));
    clock.advance(10_000);
    const next = await drivers(later, north(900));
    await settle();

    expect(asked()).toEqual(before);
    expect(first).toHaveLength(40);
    expect(moved(first, next)).toBe(40);
  });

  it('places the Drivers of two Sandboxes at different points of the saved paths', async () => {
    const { roads, rider, drivers } = await start(new InstantPacer());
    await drivers(await rider());
    await fetched(roads);

    const one = await drivers(await rider());
    const other = await drivers(await rider());

    expect(moved(one, other)).toBeGreaterThan(35);
  });

  it('keeps Drivers that set off together on the same path out of step', async () => {
    const { clock, roads, rider, drivers } = await start(new InstantPacer());
    const [one, other] = [await rider(), await rider()];
    await Promise.all([drivers(one), drivers(other)]);
    await fetched(roads);

    clock.advance(30_000);

    expect(moved(await drivers(one), await drivers(other))).toBeGreaterThan(35);
  });

  it('shares one placement when two Riders arrive in a new area at once', async () => {
    const { roads, rider, drivers } = await start(new InstantPacer());
    const [one, other] = [await rider(), await rider()];

    await Promise.all([drivers(one), drivers(other)]);
    await quiet(roads);

    expect(roads.requests).toHaveLength(1);
    expect(roads.routeRequests).toHaveLength(PATHS);
  });

  it('takes turns between areas, so a second one does not wait for the first to finish', async () => {
    const { roads, pacer, rider, drivers } = await start(new ManualPacer());
    const paris = { lat: 48.8566, lon: 2.3522 };

    await drivers(await rider());
    await drivers(await rider(), paris);
    for (let turn = 0; turn < 4; turn += 1) await pacer.step();

    const inParis = roads.routeRequests.map(([from]) => distanceM(paris, from!) < 20_000);
    expect(inParis).toEqual([false, false, true, false, true]);
  });

  it('keeps Drivers parked and the app working while the routing server is unavailable, then recovers', async () => {
    const roads = new FakeRoadService(new Error('connect ECONNREFUSED'));
    const { app, clock, rider, drivers } = await start(new InstantPacer(), roads);
    const token = await rider();
    const parked = await drivers(token);
    await quiet(roads);
    expect(roads.routeRequests).toHaveLength(PATHS * 3);

    clock.advance(60_000);
    expect(await drivers(token)).toEqual(parked);
    await request(app.getHttpServer()).post('/rider/route').set('Authorization', `Bearer ${token}`).send({ pickup: centre, dropoff: north(500) }).expect(200);

    roads.failure = undefined;
    await drivers(token);
    await quiet(roads);
    const before = await drivers(token);
    clock.advance(10_000);
    expect(moved(before, await drivers(token))).toBe(40);
  });
});
