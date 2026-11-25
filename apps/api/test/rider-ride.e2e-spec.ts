import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Ride, SandboxResponse, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { searchAreas } from '../src/dispatch/quadtree.js';
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

describe('The Ride from the Pickup Point to the Drop-off Point', () => {
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
      config: { dispatch: { acceptWindowMs: WINDOW_MS, acceptAfterMs: { min: ACCEPT_AFTER_MS, max: ACCEPT_AFTER_MS }, boardingMs: BOARDING_MS } },
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
    const retry = async (path: 'ride-requests/approach' | 'rides/route', status = 204) => {
      const res = await request(server).post(`/rider/${path}`).set('Authorization', authorization).expect(status);
      await searched();
      return res;
    };
    return { server, clock, routing, dropoff, open, after, ask, retry };
  };

  const etaOf = (ride: Ride | null) => (ride?.progress.status === 'driving' ? ride.progress.etaS : undefined);

  describe('pickup', () => {
    it('waits while the Rider gets in, with the Ride Request still open', async () => {
      const { after } = await requested();

      const sandbox = await after(PICKUP_MS - 1);

      expect(sandbox.rideRequest).toMatchObject({ status: 'matched', approach: { status: 'arrived' } });
      expect(sandbox.ride).toBeNull();
    });

    it('turns the Ride Request into a Ride with the same Driver and journey', async () => {
      const { after, dropoff } = await requested();
      const before = (await after(PICKUP_MS - 1)).rideRequest!;

      const sandbox = await after(1);

      expect(sandbox.rideRequest).toBeNull();
      expect(sandbox.ride).toEqual({
        id: before.id,
        vehicleType: 'economy',
        pickup,
        dropoff,
        driver: before.driver,
        progress: { status: 'driving', geometry: [[pickup.lon, expect.closeTo(pickup.lat, 6)], [dropoff.lon, dropoff.lat]], etaS: 200 },
      });
      expect(sandbox.driver.available).toBe(false);
    });

    it('takes a road route from the Pickup Point to the Drop-off Point', async () => {
      const { routing, dropoff } = await requested();

      expect(routing.requests).toHaveLength(2);
      expect(routing.requests[1]).toEqual({ from: pickup, to: dropoff });
    });

    it('does not happen while the Driver has no route to the Pickup Point', async () => {
      const { after } = await requested({ routing: Object.assign(new StraightRoutingService(), { outcome: 'no route' as const }) });

      const sandbox = await after(PICKUP_MS * 5);

      expect(sandbox.ride).toBeNull();
      expect(sandbox.rideRequest).toMatchObject({ status: 'matched', approach: { status: 'unavailable' } });
    });
  });

  describe('live tracking', () => {
    it('moves the vehicle along the route in real time, counting down to arrival', async () => {
      const { after, dropoff } = await requested();

      const early = await after(PICKUP_MS + 10_000);
      const later = await after(40_000);

      expect(distanceM(early.driver, north(-100))).toBeLessThan(1);
      expect(distanceM(later.driver, north(-500))).toBeLessThan(1);
      expect(later.driver.heading).toBeCloseTo(180, 0);
      expect(etaOf(later.ride)).toBe(150);
      expect(later.ride?.progress).toMatchObject({ geometry: [[later.driver.lon, later.driver.lat], [dropoff.lon, dropoff.lat]] });
    });

    it('keeps the vehicle at the Drop-off Point once there', async () => {
      const { after, dropoff } = await requested();

      const sandbox = await after(PICKUP_MS + 500_000);

      expect(distanceM(sandbox.driver, dropoff)).toBeLessThan(0.01);
      expect(sandbox.driver.available).toBe(false);
      expect(sandbox.ride?.progress).toEqual({ status: 'arrived' });
    });
  });

  describe('during a Ride', () => {
    it('refuses another Ride Request', async () => {
      const { after, ask } = await requested();
      await after(PICKUP_MS);

      const res = await ask(409);

      expect(res.body.message).toMatch(/on a Ride/i);
    });

    it('keeps its Drivers when the centre moves far away', async () => {
      const { after, open } = await requested();
      const { ride, driver } = await after(PICKUP_MS);

      const moved = await open(north(50_000));

      expect(moved.ride?.id).toBe(ride!.id);
      expect(moved.drivers[0]!.id).toBe(driver.id);
    });

    it('no longer has an open Ride Request whose approach could be looked for', async () => {
      const { after, retry } = await requested();
      await after(PICKUP_MS);

      const res = await retry('ride-requests/approach', 409);

      expect(res.body.message).toMatch(/no open Ride Request/i);
    });
  });

  describe('when there is no route to the Drop-off Point', () => {
    /** The approach is found, and the route for the Ride is not. */
    const unroutedRide = async () => {
      const routing = new (class extends StraightRoutingService {
        override async route(...points: Parameters<StraightRoutingService['route']>) {
          this.outcome = this.requests.length === 0 || this.repaired ? 'route' : 'down';
          return super.route(...points);
        }
        repaired = false;
      })();
      return requested({ routing });
    };

    it('starts the Ride, says so, and leaves the vehicle at the Pickup Point', async () => {
      const { after } = await unroutedRide();

      const sandbox = await after(PICKUP_MS + 60_000);

      expect(sandbox.ride?.progress).toEqual({ status: 'unavailable' });
      expect(distanceM(sandbox.driver, pickup)).toBeLessThan(0.01);
    });

    it('lets the Rider look again, and drives from then on', async () => {
      const { after, retry, routing } = await unroutedRide();
      await after(PICKUP_MS + 60_000);
      Object.assign(routing, { repaired: true });

      await retry('rides/route');

      expect(etaOf((await after(0)).ride)).toBe(200);
      expect(etaOf((await after(50_000)).ride)).toBe(150);
    });

    it('can only be looked for again during a Ride', async () => {
      const { retry } = await requested();

      const res = await retry('rides/route', 409);

      expect(res.body.message).toMatch(/not on a Ride/i);
    });

    it('needs a session token', async () => {
      const { server } = await requested();

      await request(server).post('/rider/rides/route').expect(401);
    });
  });

  describe('when the Sandbox stops', () => {
    const MINUTE = 60_000;
    /** 20 km is 2,000 s of driving, longer than a Sandbox runs untouched. */
    const LONG_M = 20_000;

    it('carries the Ride on from where it was, however often it stops', async () => {
      const { after } = await requested({ rideM: LONG_M });
      const drivenS = 900 - PICKUP_MS / 1_000;

      const resumed = await after(75 * MINUTE);

      expect(distanceM(resumed.driver, north(-drivenS * 10))).toBeLessThan(1);
      expect(etaOf(resumed.ride)).toBe(2_000 - drivenS);

      const again = await after(75 * MINUTE);

      expect(etaOf(again.ride)).toBe(1_100 - drivenS);
    });

    it('keeps the Ride started when stopped a second time', async () => {
      const { after } = await requested({ rideM: LONG_M });
      await after(75 * MINUTE);
      await after(75 * MINUTE);

      const sandbox = await after(1_000);

      expect(sandbox.ride).not.toBeNull();
      expect(sandbox.rideRequest).toBeNull();
    });

    it('picks the Rider up after the rest of an approach that the stop interrupted', async () => {
      const awayM = 20_000;
      const { after } = await requested({ awayM });
      const acceptMs = matchedAfterMs(awayM);
      const drivenMs = 15 * MINUTE - acceptMs;
      const resumed = await after(75 * MINUTE);
      expect(resumed.ride).toBeNull();
      const leftMs = 2_000_000 - drivenMs + BOARDING_MS;

      // Looked at part of the way, so the Sandbox keeps running.
      await after(10 * MINUTE);

      // Within a second, as the 20 km is only roughly that.
      expect((await after(leftMs - 10 * MINUTE - 1_000)).ride).toBeNull();
      expect((await after(2_000)).ride).not.toBeNull();
    });
  });
});
