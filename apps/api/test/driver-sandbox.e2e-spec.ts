import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Coordinate } from '@thirrem/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/app-config.js';
import { AuthService } from '../src/auth/auth.service.js';
import { DriverSandboxRepository } from '../src/sandbox/driver-sandbox.repository.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...centre, lat: centre.lat + metres / 111_195 });
const MINUTE = 60_000;
/** From the last activity: 15 minutes until it stops, then 24 hours until it is discarded. */
const DISCARDED_AFTER = 15 * MINUTE + 24 * 60 * MINUTE;
const APPROVAL = 10_000;
const busy = { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' };
const notApproved = 'Your application has to be approved before you get a Sandbox.';

const apps: INestApplication[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start({ config, roads = new FakeRoadService() }: { config?: Partial<AppConfig>; roads?: FakeRoadService } = {}) {
  const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
  const app = await createTestApp({ clock, roads, config: { sandboxSweepMs: 20, ...config } });
  apps.push(app);
  const http = () => request(app.getHttpServer());

  const signUp = async (role: 'rider' | 'driver') => {
    const { body } = await http().post(`/${role}/auth/signup`).send({ email: `${role}-${randomUUID()}@example.com`, password }).expect(201);
    return body.token as string;
  };
  const registered = async (vehicleType = 'comfort', model = 'Škoda Superb') => {
    const token = await signUp('driver');
    await http().post('/driver/vehicle').set('Authorization', `Bearer ${token}`).send({ vehicleType, model, colour: 'Blue' }).expect(201);
    return token;
  };
  const approved = async (vehicleType?: string, model?: string) => {
    const token = await registered(vehicleType, model);
    clock.advance(APPROVAL);
    return token;
  };
  const open = (token: string, at: Coordinate = centre) => http().put('/driver/sandbox').set('Authorization', `Bearer ${token}`).send({ centre: at });
  const read = (token: string) => http().get('/driver/sandbox').set('Authorization', `Bearer ${token}`);
  const openRider = (token: string) => http().put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send({ centre });
  return { app, clock, roads, http, signUp, registered, approved, open, read, openRider };
}

describe("An approved Driver's Sandbox", () => {
  it('puts the Driver on the street nearest the centre, in a vehicle of their Vehicle Type', async () => {
    const { approved, open } = await start();

    const { body } = await open(await approved('xl', 'Ford Galaxy')).expect(200);

    // The fake road service leaves points where they are, and numbers their headings from 0.
    expect(body).toEqual({ status: 'running', car: { ...centre, heading: 0, vehicleType: 'xl' } });
  });

  it('still puts the Driver on the map when the road service cannot be reached', async () => {
    const { approved, open } = await start({ roads: new FakeRoadService(new Error('down')) });

    const { body } = await open(await approved()).expect(200);

    expect(body.car).toMatchObject(centre);
  });

  it('can be read back', async () => {
    const { approved, open, read } = await start();
    const token = await approved();
    const opened = await open(token).expect(200);

    const res = await read(token).expect(200);

    expect(res.body).toEqual(opened.body);
  });

  it('does not exist before it is opened', async () => {
    const { approved, read } = await start();

    await read(await approved()).expect(404);
  });

  it('keeps the car where it is while the centre stays within 1 km', async () => {
    const { roads, approved, open } = await start();
    const token = await approved();
    const first = await open(token).expect(200);
    const asked = roads.requests.length;

    const again = await open(token, north(900)).expect(200);

    expect(again.body).toEqual(first.body);
    expect(roads.requests).toHaveLength(asked);
  });

  it('moves the car to a centre more than 1 km away', async () => {
    const { approved, open } = await start();
    const token = await approved();
    await open(token).expect(200);

    const { body } = await open(token, north(2_000)).expect(200);

    expect(body.car).toMatchObject(north(2_000));
  });

  it.each([
    ['no centre', {}],
    ['half a centre', { centre: { lat: 42 } }],
    ['a centre off the globe', { centre: { lat: 200, lon: 20 } }],
  ])('refuses %s', async (_, body) => {
    const { http, approved } = await start();
    const token = await approved();

    await http().put('/driver/sandbox').set('Authorization', `Bearer ${token}`).send(body).expect(400);
  });
});

describe('Who gets a Driver Sandbox', () => {
  it('is not a Driver without a vehicle', async () => {
    const { signUp, open, read } = await start();
    const token = await signUp('driver');

    expect((await open(token).expect(403)).body.message).toBe(notApproved);
    await read(token).expect(404);
  });

  it('is not a Driver still waiting for approval, who gets one as soon as they are approved', async () => {
    const { clock, roads, registered, open, read } = await start();
    const token = await registered();
    clock.advance(APPROVAL - 1);

    expect((await open(token).expect(403)).body.message).toBe(notApproved);
    await read(token).expect(404);
    expect(roads.requests).toHaveLength(0);

    clock.advance(1);
    await open(token).expect(200);
  });

  it('is not a visitor without a Driver session', async () => {
    const { http, signUp } = await start();
    const rider = await signUp('rider');

    await http().put('/driver/sandbox').send({ centre }).expect(401);
    await http().get('/driver/sandbox').expect(401);
    await http().put('/driver/sandbox').set('Authorization', `Bearer ${rider}`).send({ centre }).expect(401);
    await http().get('/driver/sandbox').set('Authorization', `Bearer ${rider}`).expect(401);
  });
});

describe('Isolation between Driver Sandboxes', () => {
  it('gives each Driver their own car, which no other Driver can move', async () => {
    const { approved, open, read } = await start();
    const [first, second] = [await approved('comfort', 'Škoda Superb'), await approved('xl', 'Ford Galaxy')];
    const mine = await open(first).expect(200);

    await open(second, north(5_000)).expect(200);

    expect((await read(first).expect(200)).body).toEqual(mine.body);
    expect((await read(second).expect(200)).body.car).toMatchObject({ ...north(5_000), vehicleType: 'xl' });
  });

  it('is kept running only by its own Driver', async () => {
    const { clock, approved, open, read } = await start();
    const [first, second] = [await approved(), await approved()];
    await open(first).expect(200);
    await open(second).expect(200);
    clock.advance(10 * MINUTE);
    await open(second).expect(200);

    clock.advance(5 * MINUTE);

    expect((await read(first).expect(200)).body.status).toBe('stopped');
    expect((await read(second).expect(200)).body.status).toBe('running');
  });
});

describe("The life of a Driver's Sandbox", () => {
  const accountOf = async (app: INestApplication, token: string) => (await app.get(AuthService).authenticate('driver', token)).id;

  it('stops after 15 minutes without activity, keeping the car, and reading it is not activity', async () => {
    const { clock, approved, open, read } = await start();
    const token = await approved();
    const { body } = await open(token).expect(200);
    clock.advance(15 * MINUTE - 1);
    expect((await read(token).expect(200)).body.status).toBe('running');

    clock.advance(1);

    expect((await read(token).expect(200)).body).toEqual({ ...body, status: 'stopped' });
  });

  it('starts the 15 minutes again each time it is opened', async () => {
    const { clock, approved, open, read } = await start();
    const token = await approved();
    await open(token).expect(200);
    clock.advance(10 * MINUTE);
    await open(token).expect(200);

    clock.advance(10 * MINUTE);

    expect((await read(token).expect(200)).body.status).toBe('running');
  });

  it('resumes where it stopped when it is opened again', async () => {
    const { clock, roads, approved, open } = await start();
    const token = await approved();
    const first = await open(token).expect(200);
    clock.advance(DISCARDED_AFTER - 1);
    const asked = roads.requests.length;

    const resumed = await open(token).expect(200);

    expect(resumed.body).toEqual(first.body);
    expect(roads.requests).toHaveLength(asked);
  });

  it('is discarded 24 hours after it stops, and a returning Driver gets a new one', async () => {
    const { clock, roads, approved, open, read } = await start();
    const token = await approved();
    await open(token).expect(200);
    const asked = roads.requests.length;

    clock.advance(DISCARDED_AFTER);

    await read(token).expect(404);
    await open(token).expect(200);
    expect(roads.requests).toHaveLength(asked + 1);
  });

  it('lets go of a discarded Sandbox even if its Driver never comes back, and no other', async () => {
    const { app, clock, approved, open } = await start();
    const [gone, recent] = [await approved(), await approved()];
    await open(gone).expect(200);
    clock.advance(MINUTE);
    await open(recent).expect(200);
    const sandboxes = app.get(DriverSandboxRepository);
    const [goneId, recentId] = [await accountOf(app, gone), await accountOf(app, recent)];

    clock.advance(DISCARDED_AFTER - MINUTE);

    await vi.waitFor(async () => expect(await sandboxes.findByAccount(goneId)).toBeNull(), { interval: 5 });
    expect(await sandboxes.findByAccount(recentId)).not.toBeNull();
  });
});

describe('The limit on running Sandboxes, shared with the Rider app', () => {
  it('runs 30 Sandboxes at once, and tells the next Driver it is busy', async () => {
    const { approved, open } = await start();
    for (let count = 0; count < 30; count += 1) await open(await approved()).expect(200);

    const res = await open(await approved()).expect(503);

    expect(res.body).toMatchObject(busy);
  });

  it('counts the Rider and Driver Sandboxes together', async () => {
    const { signUp, approved, open, openRider } = await start({ config: { sandboxLimit: 2 } });
    await openRider(await signUp('rider')).expect(200);
    await open(await approved()).expect(200);

    expect((await open(await approved()).expect(503)).body).toMatchObject(busy);
    expect((await openRider(await signUp('rider')).expect(503)).body).toMatchObject(busy);
  });

  it('gives the place of a stopped Sandbox to the next Driver, and keeps the stopped one for later', async () => {
    const { clock, approved, open, read } = await start({ config: { sandboxLimit: 1 } });
    const first = await approved();
    const opened = await open(first).expect(200);
    clock.advance(15 * MINUTE);

    await open(await approved()).expect(200);

    await open(first).expect(503);
    expect((await read(first).expect(200)).body).toEqual({ ...opened.body, status: 'stopped' });
  });

  it('lets a Driver with a running Sandbox open or move it while every place is taken', async () => {
    const { approved, open } = await start({ config: { sandboxLimit: 1 } });
    const token = await approved();
    await open(token).expect(200);

    await open(token).expect(200);
    await open(token, north(2_000)).expect(200);
  });

  it('gives the last place to only one of the Drivers who arrive together', async () => {
    const { approved, open } = await start({ config: { sandboxLimit: 1 } });
    const tokens = [await approved(), await approved(), await approved()];

    const answers = await Promise.all(tokens.map((token) => open(token)));

    expect(answers.map((res) => res.status).sort()).toEqual([200, 503, 503]);
  });

  it('asks nothing of the road service for a Driver it turns away', async () => {
    const { roads, approved, open } = await start({ config: { sandboxLimit: 1 } });
    await open(await approved()).expect(200);
    const asked = roads.requests.length;

    await open(await approved(), north(50_000)).expect(503);

    expect(roads.requests).toHaveLength(asked);
  });
});
