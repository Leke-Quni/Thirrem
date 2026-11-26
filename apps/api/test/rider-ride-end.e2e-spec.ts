import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { SandboxResponse, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { searchAreas } from '../src/dispatch/quadtree.js';
import { FARE_RATES } from '../src/fares/fare-rates.js';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FixedAreaRepository } from './support/fixed-area.js';
import { StraightRoutingService } from './support/fake-routing.js';
import { InstantPacer, settle } from './support/pacers.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...pickup, lat: pickup.lat + metres / 111_195 });
const WINDOW_MS = 9_000;
const ACCEPT_AFTER_MS = 2_000;
const BOARDING_MS = 15_000;
/** The Driver usually starts 1 km from the Pickup Point, which is 100 s of driving at 10 m/s. */
const APPROACH_MS = 100_000;
/** When the only Driver there is, parked `awayM` north, accepts: soon after the search has widened far enough to ask. */
const matchedAfterMs = (awayM: number) => searchAreas(pickup, [north(awayM)]).findIndex((area) => area.length > 0) * WINDOW_MS + ACCEPT_AFTER_MS;
const ACCEPT_MS = matchedAfterMs(1_000);
const PICKUP_MS = ACCEPT_MS + APPROACH_MS + BOARDING_MS;
const STOP_MS = 5_000;

describe('Ending a Ride early', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const searched = async () => {
    for (let turn = 0; turn < 10; turn += 1) await settle();
  };

  /** A Rider who has just requested a Ride, `rideM` long due south, from the only Driver there is. */
  const requested = async ({ rideM = 2_000, awayM = 1_000, routing = new StraightRoutingService() } = {}) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(awayM) };
    const app = await createTestApp({
      clock,
      routing,
      pacer: new InstantPacer(),
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { dispatch: { acceptWindowMs: WINDOW_MS, acceptAfterMs: { min: ACCEPT_AFTER_MS, max: ACCEPT_AFTER_MS }, boardingMs: BOARDING_MS, stopMs: STOP_MS } },
    });
    apps.push(app);
    const server = app.getHttpServer();
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    const authorization = `Bearer ${session.token}`;
    const open = async (centre = pickup): Promise<SandboxResponse> => (await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre }).expect(200)).body;
    const dropoff = north(-rideM);
    const ask = (status: number) => request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup, dropoff, vehicleType: 'economy' }).expect(status);
    await open();
    await ask(201);
    await searched();
    /** The Sandbox and its one Driver, `ms` later. */
    const after = async (ms: number): Promise<SandboxResponse & { driver: SimulatedDriver }> => {
      clock.advance(ms);
      const sandbox = await open();
      return { ...sandbox, driver: sandbox.drivers[0]! };
    };
    const end = async (status = 204) => {
      const res = await request(server).post('/rider/rides/end').set('Authorization', authorization).expect(status);
      await searched();
      return res;
    };
    return { server, dropoff, open, after, ask, end };
  };

  /** A Rider `drivenMs` into a Ride, which takes 200 s to drive in full. */
  const riding = async (drivenMs = 40_000, options: Parameters<typeof requested>[0] = {}) => {
    const ride = await requested(options);
    await ride.after(PICKUP_MS + drivenMs);
    return ride;
  };

  it('has not been asked for as the Ride starts', async () => {
    const { after } = await requested();

    const { ride } = await after(PICKUP_MS);

    expect(ride).toMatchObject({ endRequested: false, finalFare: null });
  });

  it('keeps driving until the Driver has stopped', async () => {
    const { after, end } = await riding();

    await end();
    const sandbox = await after(STOP_MS - 1);

    expect(sandbox.ride).toMatchObject({ endRequested: true, finalFare: null, progress: { status: 'driving' } });
    expect(sandbox.driver.available).toBe(false);
  });

  it('ends the Ride where the Driver stopped, and leaves the vehicle there', async () => {
    const { after, end } = await riding();
    await end();

    const stopped = await after(STOP_MS);
    const later = await after(60_000);

    expect(stopped.ride).toMatchObject({ endRequested: true, progress: { status: 'arrived' } });
    expect(distanceM(stopped.driver, north(-450))).toBeLessThan(1);
    expect(distanceM(later.driver, north(-450))).toBeLessThan(1);
    expect(later.ride?.finalFare).toEqual(stopped.ride?.finalFare);
  });

  it('charges the usual formula for the distance and time travelled', async () => {
    const { after, end } = await riding();
    await end();

    const { ride } = await after(STOP_MS);

    // 450 m in 45 s of Economy.
    const { baseCents, perKmCents, perMinCents } = FARE_RATES.vehicleTypes.economy;
    expect(ride?.finalFare).toEqual({ amountCents: Math.round(baseCents + perKmCents * 0.45 + perMinCents * 0.75), currency: 'EUR' });
  });

  it('is not put off by asking twice', async () => {
    const { after, end } = await riding();
    await end();
    await after(STOP_MS - 1_000);

    await end();

    expect((await after(1_000)).ride?.finalFare).not.toBeNull();
  });

  it('charges no more than the whole Ride when asked just before the Drop-off Point', async () => {
    const { after, end, dropoff } = await riding(198_000);
    await end();

    const sandbox = await after(STOP_MS);

    // 2 km in 200 s.
    const { baseCents, perKmCents, perMinCents } = FARE_RATES.vehicleTypes.economy;
    expect(sandbox.ride?.finalFare?.amountCents).toBe(Math.round(baseCents + perKmCents * 2 + (perMinCents * 200) / 60));
    expect(distanceM(sandbox.driver, dropoff)).toBeLessThan(0.01);
  });

  it('releases the Driver, who waits where the Ride ended', async () => {
    const { after, end, ask } = await riding();
    await end();

    const ended = await after(STOP_MS);
    expect(ended.driver.available).toBe(true);
    await ask(201);
    const next = await after(0);

    expect(next.ride).toBeNull();
    expect(next.rideRequest).not.toBeNull();
    expect(distanceM(next.driver, north(-450))).toBeLessThan(1);
  });

  it('places new Drivers when the centre has moved far away', async () => {
    const { after, end, open } = await riding();
    await end();
    const { driver } = await after(STOP_MS);

    const moved = await open(north(50_000));

    expect(moved.ride).toBeNull();
    expect(moved.drivers[0]!.id).not.toBe(driver.id);
  });

  it('stops after the rest of the wait when the Sandbox stops first', async () => {
    const MINUTE = 60_000;
    const { after, end } = await riding(40_000, { rideM: 20_000 });
    await end();

    const resumed = await after(75 * MINUTE);

    // The Sandbox ran on for 15 minutes untouched, which is long past the stop.
    expect(distanceM(resumed.driver, north(-450))).toBeLessThan(1);
    expect(resumed.ride?.finalFare).not.toBeNull();
  });

  it('can only be asked for during a Ride', async () => {
    const { end } = await requested();

    const res = await end(409);

    expect(res.body.message).toMatch(/not on a Ride/i);
  });

  it('cannot be asked for once the Ride has ended', async () => {
    const { after, end } = await riding();
    await end();
    await after(STOP_MS);

    const res = await end(409);

    expect(res.body.message).toMatch(/not on a Ride/i);
  });

  it('cannot be asked for once the Ride has completed at the Drop-off Point', async () => {
    const { end } = await riding(300_000);

    const res = await end(409);

    expect(res.body.message).toMatch(/not on a Ride/i);
  });

  it('cannot be asked for while there is no route to drive', async () => {
    const routing = new (class extends StraightRoutingService {
      override async route(...points: Parameters<StraightRoutingService['route']>) {
        this.outcome = this.requests.length === 0 ? 'route' : 'down';
        return super.route(...points);
      }
    })();
    const { end } = await riding(40_000, { routing });

    const res = await end(409);

    expect(res.body.message).toMatch(/no route/i);
  });

  it('needs a session token', async () => {
    const { server } = await requested();

    await request(server).post('/rider/rides/end').expect(401);
  });
});
