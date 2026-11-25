import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { RideRequest, SandboxResponse, VehicleType } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/app-config.js';
import { createTestApp, ManualClock } from './support/app.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const dropoff = { lat: 42.39, lon: 20.45 };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Long enough for a Driver in the widest area to have accepted. */
const UNTIL_MATCHED = 62_000;

describe("A Rider's Ride Request", () => {
  const apps: INestApplication[] = [];
  const sockets: WebSocket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const start = async (options: Parameters<typeof createTestApp>[0] = {}) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const app = await createTestApp({ clock, ...options, config: { live: { intervalMs: 20, helloTimeoutMs: 200 }, ...options.config } });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer();

    const rider = async () => {
      const { body } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
      const authorization = `Bearer ${body.token}`;
      const open = (more: object = {}) => request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre, ...more });
      return {
        token: body.token as string,
        open,
        sandbox: async (more?: object): Promise<SandboxResponse> => (await open(more).expect(200)).body,
        ask: (body: object = {}) => request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup: centre, dropoff, vehicleType: 'economy', ...body }),
      };
    };
    const opened = async () => {
      const one = await rider();
      await one.sandbox();
      return one;
    };
    /** The first message of the live feed. */
    const live = (token: string) => {
      const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/rider/live`);
      sockets.push(socket);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ event: 'watch', data: { token } })));
      return new Promise<SandboxResponse>((resolve) => socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data)).data), { once: true }));
    };
    return { clock, rider, opened, live, server };
  };
  const statuses = (rideRequest: RideRequest) => rideRequest.offers.map((offer) => offer.status);
  const unavailable = ({ drivers }: SandboxResponse) => drivers.filter((driver) => !driver.available).map((driver) => driver.id);

  /** The standard dispatch, but with no Driver answering inside the accept window, so the Ride Request fails. */
  const unanswered = { config: { dispatch: { ...loadConfig().dispatch, acceptAfterMs: { min: HOUR, max: HOUR } } } };
  /** Every window there is. */
  const UNTIL_FAILED = 63_000;

  it('has none until the Rider asks', async () => {
    const { opened } = await start();
    const rider = await opened();

    const sandbox = await rider.sandbox();

    expect(sandbox.rideRequest).toBeNull();
    expect(unavailable(sandbox)).toEqual([]);
  });

  it.each<VehicleType>(['economy', 'comfort', 'xl', 'electric'])('searches for a Driver of the chosen Vehicle Type: %s', async (vehicleType) => {
    const { clock, opened } = await start(unanswered);
    const rider = await opened();

    const { body } = await rider.ask({ vehicleType }).expect(201);
    clock.advance(UNTIL_FAILED - 1);

    expect(body).toMatchObject({ vehicleType, pickup: centre, dropoff, status: 'searching', driver: null });
    const { drivers, rideRequest } = await rider.sandbox();
    expect(rideRequest!.offers.map((offer) => offer.driverId).sort()).toEqual(drivers.filter((driver) => driver.vehicleType === vehicleType).map((driver) => driver.id).sort());
    expect(new Set(statuses(rideRequest!))).toEqual(new Set(['offered']));
  });

  it('is still searching before any Driver has had time to accept', async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    await rider.ask().expect(201);

    clock.advance(1_999);

    const { rideRequest } = await rider.sandbox();
    expect(rideRequest?.status).toBe('searching');
    expect(rideRequest?.driver).toBeNull();
  });

  it('is matched to the first Driver to accept, and withdrawn from every other', async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    await rider.ask().expect(201);

    clock.advance(UNTIL_MATCHED);

    const { rideRequest } = await rider.sandbox();
    expect(rideRequest?.status).toBe('matched');
    const accepted = rideRequest!.offers.filter((offer) => offer.status === 'accepted');
    expect(accepted.map((offer) => offer.driverId)).toEqual([rideRequest!.driver!.id]);
    expect(statuses(rideRequest!).filter((status) => status === 'withdrawn')).toHaveLength(rideRequest!.offers.length - 1);
  });

  it('is matched as soon as one Driver accepts, and stays with that Driver', async () => {
    const { clock, opened } = await start({ config: { dispatch: { ...loadConfig().dispatch, acceptAfterMs: { min: 2_000, max: 8_000 } } } });
    const rider = await opened();
    await rider.ask().expect(201);
    let first: RideRequest | null = null;
    while (first?.status !== 'matched') {
      clock.advance(1);
      first = (await rider.sandbox()).rideRequest;
      clock.advance(99);
    }

    clock.advance(MINUTE);

    expect((await rider.sandbox()).rideRequest).toEqual({ ...first, approach: expect.anything() });
  });

  it("shows the matched Driver's name, vehicle and rating", async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    await rider.ask({ vehicleType: 'electric' }).expect(201);

    clock.advance(UNTIL_MATCHED);

    const driver = (await rider.sandbox()).rideRequest!.driver!;
    expect(driver.name).toMatch(/^\p{L}+ \p{L}\.$/u);
    expect(driver.rating).toBeGreaterThanOrEqual(4.5);
    expect(driver.rating).toBeLessThanOrEqual(5);
    expect(driver.vehicle.model).toBeTruthy();
    expect(driver.vehicle.colour).toBeTruthy();
    expect(driver.vehicle.plate).toMatch(/^TH-\d{3}-[A-Z]{2}$/);
  });

  it('makes the matched Driver, and no other, no longer Available', async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    await rider.ask().expect(201);
    expect(unavailable(await rider.sandbox())).toEqual([]);

    clock.advance(UNTIL_MATCHED);

    const sandbox = await rider.sandbox();
    expect(unavailable(sandbox)).toEqual([sandbox.rideRequest!.driver!.id]);
  });

  it('is told to the Rider on the live feed', async () => {
    const { clock, opened, live } = await start();
    const rider = await opened();
    await rider.ask().expect(201);
    clock.advance(UNTIL_MATCHED);

    const message = await live(rider.token);

    expect(message.rideRequest?.status).toBe('matched');
    expect(unavailable(message)).toEqual([message.rideRequest!.driver!.id]);
  });

  it('keeps the Sandbox running', async () => {
    const { clock, opened, live } = await start();
    const rider = await opened();
    clock.advance(10 * MINUTE);
    await rider.ask().expect(201);

    clock.advance(10 * MINUTE);

    expect((await live(rider.token)).drivers).toHaveLength(40);
  });

  it('cannot be made twice while one is open', async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    const { body: first } = await rider.ask().expect(201);

    const searching = await rider.ask({ vehicleType: 'xl' }).expect(409);
    clock.advance(UNTIL_MATCHED);
    await rider.ask().expect(409);

    expect(searching.body.message).toMatch(/already have an open Ride Request/i);
    expect((await rider.sandbox()).rideRequest?.id).toBe(first.id);
  });

  it('is only one when the Rider asks twice at once', async () => {
    const { opened } = await start();
    const rider = await opened();

    const answers = await Promise.all([rider.ask(), rider.ask()]);

    expect(answers.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it('is told to the Rider on the live feed once it has failed', async () => {
    const { clock, opened, live } = await start(unanswered);
    const rider = await opened();
    await rider.ask().expect(201);
    clock.advance(UNTIL_FAILED);

    expect((await live(rider.token)).rideRequest?.status).toBe('failed');
  });

  it('can be made again after one has failed', async () => {
    const { clock, opened } = await start(unanswered);
    const rider = await opened();
    const { body: first } = await rider.ask().expect(201);
    clock.advance(UNTIL_FAILED);

    const { body: second } = await rider.ask({ vehicleType: 'xl' }).expect(201);

    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ vehicleType: 'xl', status: 'searching' });
    expect((await rider.sandbox()).rideRequest).toEqual(second);
  });

  it('no longer keeps its Drivers once it has failed and the Rider moves', async () => {
    const { clock, opened } = await start(unanswered);
    const rider = await opened();
    await rider.ask().expect(201);
    const before = await rider.sandbox();
    clock.advance(UNTIL_FAILED);

    const after = await rider.sandbox({ centre: { lat: 48.8566, lon: 2.3522 } });

    expect(after.rideRequest).toBeNull();
    expect(after.drivers[0]!.id).not.toBe(before.drivers[0]!.id);
  });

  it('keeps its Drivers when the Rider moves while it is open', async () => {
    const { opened } = await start();
    const rider = await opened();
    const { body } = await rider.ask().expect(201);
    const before = await rider.sandbox();

    const after = await rider.sandbox({ centre: { lat: 48.8566, lon: 2.3522 } });

    expect(after.rideRequest?.id).toBe(body.id);
    expect(after.drivers.map((driver) => driver.id)).toEqual(before.drivers.map((driver) => driver.id));
  });

  it.each([
    ['searching', 0],
    ['matched', UNTIL_MATCHED],
  ])('is dropped when the Rider starts a new Sandbox while %s', async (_, waitMs) => {
    const { clock, opened } = await start();
    const rider = await opened();
    await rider.ask().expect(201);
    clock.advance(waitMs);

    const next = await rider.sandbox({ fresh: true });

    expect(next.rideRequest).toBeNull();
    expect(unavailable(next)).toEqual([]);
    await rider.ask().expect(201);
  });

  it('is still there when a stopped Sandbox is resumed', async () => {
    const { clock, opened } = await start();
    const rider = await opened();
    const { body } = await rider.ask().expect(201);

    clock.advance(30 * MINUTE);

    expect((await rider.sandbox()).rideRequest).toMatchObject({ id: body.id, status: 'matched' });
  });

  it("never touches another Rider's Sandbox", async () => {
    const { clock, opened } = await start();
    const [one, other] = [await opened(), await opened()];
    await one.ask().expect(201);
    clock.advance(UNTIL_MATCHED);

    const theirs = await other.sandbox();

    expect(theirs.rideRequest).toBeNull();
    expect(unavailable(theirs)).toEqual([]);
  });

  it('is refused without a running Sandbox', async () => {
    const { clock, rider, opened } = await start();
    const never = await rider();
    const stopped = await opened();
    clock.advance(15 * MINUTE);

    for (const one of [never, stopped]) expect((await one.ask().expect(409)).body.message).toMatch(/sandbox is not running/i);
  });

  it('is refused without a session token', async () => {
    const { server } = await start();

    await request(server).post('/rider/ride-requests').send({ pickup: centre, dropoff, vehicleType: 'economy' }).expect(401);
  });

  it.each([
    ['Vehicle Type', { vehicleType: 'helicopter' }, /vehicle type/i],
    ['Pickup Point', { pickup: { lat: 91, lon: 20 } }, /pickup point/i],
    ['Drop-off Point', { dropoff: null }, /drop-off point/i],
  ])('is rejected without a proper %s', async (_, body, message) => {
    const { opened } = await start();
    const rider = await opened();

    const res = await rider.ask(body).expect(400);

    expect(res.body.message).toMatch(message);
  });

  it('is rate limited per client', async () => {
    const { opened } = await start({ routeRateLimit: { limit: 2, windowMs: 60_000 } });
    const rider = await opened();
    await rider.ask().expect(201);
    await rider.ask().expect(409);

    const res = await rider.ask().expect(429);

    expect(res.body.message).toMatch(/too many ride requests/i);
  });
});
