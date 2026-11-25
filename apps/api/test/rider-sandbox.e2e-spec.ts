import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { SandboxResponse } from '@thirrem/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...centre, lat: centre.lat + metres / 111_195 });

describe("The Rider's Sandbox and its simulated Drivers", () => {
  let app: INestApplication;
  const roads = new FakeRoadService();

  const signUp = async (target: INestApplication) => {
    const { body } = await request(target.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    return body.token as string;
  };
  const openOn = (target: INestApplication, token: string, body: object = { centre }) =>
    request(target.getHttpServer()).put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send(body);
  const open = (token: string, body?: object) => openOn(app, token, body);
  const ids = (body: SandboxResponse) => body.drivers.map((driver) => driver.id).sort();

  beforeAll(async () => {
    app = await createTestApp({ roads });
  });
  afterAll(async () => {
    await app.close();
  });

  it('starts a Sandbox with 40 Drivers within 10 km, 10 of each Vehicle Type', async () => {
    const { body } = await open(await signUp(app)).expect(200);

    expect(body.drivers).toHaveLength(40);
    for (const driver of body.drivers) expect(distanceM(centre, driver)).toBeLessThanOrEqual(10_000);
    for (const type of ['economy', 'comfort', 'xl', 'electric']) {
      expect(body.drivers.filter((driver: { vehicleType: string }) => driver.vehicleType === type)).toHaveLength(10);
    }
    expect(Object.keys(body.drivers[0]).sort()).toEqual(['heading', 'id', 'lat', 'lon', 'vehicleType']);
  });

  it('asks the road service for a whole Sandbox at once: one snap and one set of headings', async () => {
    const before = { snaps: roads.requests.length, headings: roads.headingRequests.length };

    await open(await signUp(app)).expect(200);

    expect(roads.requests.length - before.snaps).toBe(1);
    expect(roads.headingRequests.length - before.headings).toBe(1);
    expect(roads.headingRequests.at(-1)).toHaveLength(40);
  });

  it('turns each Driver along its street', async () => {
    const { body } = await open(await signUp(app)).expect(200);

    expect(body.drivers.map((driver: { heading: number }) => driver.heading)).toEqual(Array.from({ length: 40 }, (_, index) => index));
  });

  it('keeps the same Drivers while the centre stays within 1 km', async () => {
    const token = await signUp(app);
    const first = await open(token).expect(200);

    const again = await open(token, { centre: north(900) }).expect(200);

    expect(again.body).toEqual(first.body);
  });

  it('places the Drivers again around a centre more than 1 km away', async () => {
    const token = await signUp(app);
    const first = await open(token).expect(200);
    const paris = { lat: 48.8566, lon: 2.3522 };

    const moved = await open(token, { centre: paris }).expect(200);

    expect(ids(moved.body)).not.toEqual(ids(first.body));
    for (const driver of moved.body.drivers) expect(distanceM(paris, driver)).toBeLessThanOrEqual(10_000);
  });

  it('never shows one Rider the Drivers of another Sandbox', async () => {
    const [one, other] = [await signUp(app), await signUp(app)];

    const first = await open(one).expect(200);
    const second = await open(other).expect(200);

    expect(ids(second.body).filter((id) => ids(first.body).includes(id))).toEqual([]);
    expect((await open(one).expect(200)).body).toEqual(first.body);
  });

  it('starts only one Sandbox when the same Rider asks twice at once', async () => {
    const token = await signUp(app);

    const [first, second] = await Promise.all([open(token).expect(200), open(token).expect(200)]);

    expect(second.body).toEqual(first.body);
  });

  it('still places the Drivers when the road service is unavailable', async () => {
    const down = await createTestApp({ roads: new FakeRoadService(new Error('connect ECONNREFUSED')) });

    const { body } = await openOn(down, await signUp(down)).expect(200);

    expect(body.drivers).toHaveLength(40);
    const headings: number[] = body.drivers.map((driver: { heading: number }) => driver.heading);
    for (const heading of headings) expect(heading >= 0 && heading < 360).toBe(true);
    expect(new Set(headings).size).toBeGreaterThan(20);
    await down.close();
  });

  it('refuses a request with no session token', async () => {
    await request(app.getHttpServer()).put('/rider/sandbox').send({ centre }).expect(401);
  });

  it('rejects a missing, non-numeric or out-of-range centre', async () => {
    const token = await signUp(app);

    await open(token, {}).expect(400);
    await open(token, { centre: { lat: 'x', lon: 1 } }).expect(400);
    const res = await open(token, { centre: { lat: 91, lon: 20 } }).expect(400);

    expect(res.body.message).toMatch(/sandbox centre/i);
  });

  it('limits Sandbox requests per client until the window passes', async () => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const limited = await createTestApp({ clock, roads: new FakeRoadService(), routeRateLimit: { limit: 2, windowMs: 60_000 } });
    const token = await signUp(limited);

    await openOn(limited, token).expect(200);
    await openOn(limited, token).expect(200);
    const res = await openOn(limited, token).expect(429);
    clock.advance(60_000);
    await openOn(limited, token).expect(200);

    expect(res.body.message).toMatch(/too many sandbox requests/i);
    await limited.close();
  });
});
