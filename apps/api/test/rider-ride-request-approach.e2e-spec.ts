import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { RideRequest, SandboxResponse, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { searchAreas } from '../src/dispatch/quadtree.js';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FixedAreaRepository } from './support/fixed-area.js';
import { StraightRoutingService } from './support/fake-routing.js';
import { InstantPacer, ManualPacer, settle } from './support/pacers.js';
import type { Pacer } from '../src/sandbox/pacer.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const dropoff = { lat: 42.39, lon: 20.45 };
const north = (metres: number) => ({ ...pickup, lat: pickup.lat + metres / 111_195 });
const WINDOW_MS = 9_000;
const ACCEPT_AFTER_MS = 2_000;
const BOARDING_MS = 15_000;
/** When the only Driver there is, parked `awayM` north, accepts: soon after the search has widened far enough to ask. */
const matchedAfterMs = (awayM: number) => searchAreas(pickup, [north(awayM)]).findIndex((area) => area.length > 0) * WINDOW_MS + ACCEPT_AFTER_MS;
const ACCEPT_MS = matchedAfterMs(1_000);

describe('The matched Driver approaching the Pickup Point', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** Lets a search for a route get as far as it can, through any pauses that end by themselves. */
  const searched = async () => {
    for (let turn = 0; turn < 5; turn += 1) await settle();
  };

  /** A Rider who has just requested a Ride from the only Driver there is, parked `awayM` north of the Pickup Point. */
  const requested = async (routing = new StraightRoutingService(), awayM = 1_000, pacer: Pacer = new InstantPacer()) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(awayM) };
    const app = await createTestApp({
      clock,
      routing,
      pacer,
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { dispatch: { acceptWindowMs: WINDOW_MS, acceptAfterMs: { min: ACCEPT_AFTER_MS, max: ACCEPT_AFTER_MS }, boardingMs: BOARDING_MS, stopMs: 5_000 } },
    });
    apps.push(app);
    const server = app.getHttpServer();
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    const authorization = `Bearer ${session.token}`;
    const open = async (): Promise<SandboxResponse> => (await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup }).expect(200)).body;
    await open();
    await request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup, dropoff, vehicleType: 'economy' }).expect(201);
    await searched();
    /** The Sandbox's one Driver and the Ride Request, `ms` later. */
    const after = async (ms: number): Promise<{ driver: SimulatedDriver; rideRequest: RideRequest }> => {
      clock.advance(ms);
      const sandbox = await open();
      return { driver: sandbox.drivers[0]!, rideRequest: sandbox.rideRequest! };
    };
    const retry = async (status = 204) => {
      const res = await request(server).post('/rider/ride-requests/approach').set('Authorization', authorization).expect(status);
      await searched();
      return res;
    };
    return { server, authorization, clock, routing, station, open, after, retry };
  };
  const routing = (outcome: StraightRoutingService['outcome']) => Object.assign(new StraightRoutingService(), { outcome });

  it('takes a road route from where the Driver is to the Pickup Point', async () => {
    const { routing, station, after } = await requested();

    const { rideRequest } = await after(ACCEPT_MS);

    expect(routing.requests[0]).toEqual({ from: { lat: station.lat, lon: station.lon }, to: pickup });
    expect(rideRequest.approach).toEqual({ status: 'driving', geometry: [[station.lon, station.lat], [pickup.lon, pickup.lat]], etaS: 100 });
  });

  it('has none while still searching', async () => {
    const { station, after } = await requested();

    const { driver, rideRequest } = await after(ACCEPT_MS - 1);

    expect(rideRequest.approach).toBeNull();
    expect(driver).toMatchObject({ lat: station.lat, lon: station.lon });
  });

  it('drives the Driver along the route from the moment of the match, counting down the time to arrival', async () => {
    const { after } = await requested();

    const { driver, rideRequest } = await after(ACCEPT_MS + 40_000);

    expect(distanceM(driver, north(600))).toBeLessThan(1);
    expect(driver.heading).toBeCloseTo(180, 0);
    expect(rideRequest.approach).toMatchObject({ status: 'driving', etaS: 60 });
  });

  it.each([
    ['just as it arrives', 100_000],
    ['while the Rider gets in', 100_000 + BOARDING_MS - 1],
  ])('waits at the Pickup Point once there: %s', async (_, drivingMs) => {
    const { after } = await requested();

    const { driver, rideRequest } = await after(ACCEPT_MS + drivingMs);

    expect(distanceM(driver, pickup)).toBeLessThan(0.01);
    expect(driver.heading).toBeCloseTo(180, 0);
    expect(driver.available).toBe(false);
    expect(rideRequest.approach).toEqual({ status: 'arrived' });
    expect(rideRequest.status).toBe('matched');
  });

  it('sends only the road still ahead, starting where the Driver is', async () => {
    const bends = Object.assign(new StraightRoutingService(), { via: [north(500)] });
    const { after } = await requested(bends);
    const ahead = ({ driver, rideRequest }: Awaited<ReturnType<typeof after>>) => {
      const { approach } = rideRequest;
      if (approach?.status !== 'driving') throw new Error('The Driver is not on the way');
      expect(approach.geometry[0]).toEqual([driver.lon, driver.lat]);
      return approach.geometry.slice(1);
    };

    expect(ahead(await after(ACCEPT_MS + 40_000))).toEqual([[pickup.lon, north(500).lat], [pickup.lon, pickup.lat]]);
    // Past the bend, which is no longer part of what is left.
    expect(ahead(await after(20_000))).toEqual([[pickup.lon, pickup.lat]]);
  });

  it('waits where it was matched while the route is still being looked for, then sets off', async () => {
    let answer!: () => void;
    const slow = Object.assign(new StraightRoutingService(), { held: new Promise<void>((resolve) => (answer = resolve)) });
    const { station, after } = await requested(slow);
    const waiting = await after(ACCEPT_MS + 30_000);
    expect(waiting.rideRequest.approach).toEqual({ status: 'routing' });
    expect(waiting.driver).toMatchObject({ lat: station.lat, lon: station.lon });

    answer();
    await settle();

    expect((await after(0)).rideRequest.approach).toMatchObject({ status: 'driving', etaS: 100 });
    expect((await after(40_000)).rideRequest.approach).toMatchObject({ status: 'driving', etaS: 60 });
  });

  describe('when the routing server cannot give a route', () => {
    it.each(['down', 'no route'] as const)('keeps the match, says so, and leaves the Driver waiting: %s', async (outcome) => {
      const { station, after } = await requested(routing(outcome));

      const { driver, rideRequest } = await after(ACCEPT_MS + 60_000);

      expect(rideRequest.status).toBe('matched');
      expect(rideRequest.approach).toEqual({ status: 'unavailable' });
      expect(driver).toMatchObject({ lat: station.lat, lon: station.lon });
    });

    it('tries again by itself after 2 seconds, and the Driver sets off if that finds a route', async () => {
      const server = routing('down');
      const pacer = new ManualPacer();
      const { after } = await requested(server, 1_000, pacer);
      expect((await after(ACCEPT_MS)).rideRequest.approach).toEqual({ status: 'routing' });
      expect(pacer.pauses).toEqual([2_000]);
      server.outcome = 'route';

      await pacer.step();

      expect((await after(0)).rideRequest.approach).toMatchObject({ status: 'driving', etaS: 100 });
      expect(server.requests).toHaveLength(3);
    });

    it('gives up only after trying twice more, 2 and then 5 seconds apart', async () => {
      const server = routing('down');
      const pacer = new ManualPacer();
      const { after } = await requested(server, 1_000, pacer);
      await pacer.step();
      expect((await after(ACCEPT_MS)).rideRequest.approach).toEqual({ status: 'routing' });

      await pacer.step();

      expect((await after(0)).rideRequest.approach).toEqual({ status: 'unavailable' });
      expect(pacer.pauses).toEqual([2_000, 5_000]);
      expect(server.requests).toHaveLength(3);
    });

    it('does not try again by itself when there is no road to find', async () => {
      const server = routing('no route');
      const pacer = new ManualPacer();

      const { after } = await requested(server, 1_000, pacer);

      expect((await after(ACCEPT_MS)).rideRequest.approach).toEqual({ status: 'unavailable' });
      expect(server.requests).toHaveLength(1);
      expect(pacer.pauses).toEqual([]);
    });

    it('lets the Rider try again, and the Driver sets off once there is a route', async () => {
      const server = routing('down');
      const { after, retry } = await requested(server);
      await after(ACCEPT_MS + 60_000);
      server.outcome = 'route';

      await retry();

      expect((await after(0)).rideRequest.approach).toMatchObject({ status: 'driving', etaS: 100 });
      expect(server.requests).toHaveLength(5);
      expect(server.requests[3]).toEqual(server.requests[0]);
    });

    it('can be tried any number of times', async () => {
      const server = routing('down');
      const { after, retry } = await requested(server);
      await after(ACCEPT_MS);

      await retry();

      expect((await after(0)).rideRequest.approach).toEqual({ status: 'unavailable' });
      await retry();
      expect(server.requests).toHaveLength(9);
    });

    it('still lets the Rider start a new Sandbox', async () => {
      const { server, authorization, after } = await requested(routing('down'));
      await after(ACCEPT_MS);

      const res = await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup, fresh: true }).expect(200);

      expect(res.body.rideRequest).toBeNull();
    });
  });

  describe('asking for the route again', () => {
    it('asks nothing of the routing server when there is a route already', async () => {
      const { routing: server, after, retry } = await requested();
      await after(ACCEPT_MS + 40_000);

      await retry();

      expect(server.requests).toHaveLength(2);
      expect((await after(0)).rideRequest.approach).toMatchObject({ etaS: 60 });
    });

    it('is refused without an open Ride Request', async () => {
      const { server, authorization, retry } = await requested();
      await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup, fresh: true }).expect(200);

      const res = await retry(409);

      expect(res.body.message).toMatch(/no open Ride Request/i);
    });

    it('is refused once the Ride Request has failed', async () => {
      const { server, authorization, clock, retry } = await requested();
      await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup, fresh: true }).expect(200);
      await request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup, dropoff, vehicleType: 'xl' }).expect(201);
      clock.advance(7 * WINDOW_MS);

      const res = await retry(409);

      expect(res.body.message).toMatch(/no open Ride Request/i);
    });

    it('is refused without a session token', async () => {
      const { server } = await requested();

      await request(server).post('/rider/ride-requests/approach').expect(401);
    });

    it('keeps the Sandbox running', async () => {
      const { clock, retry } = await requested(routing('down'));
      clock.advance(10 * 60_000);
      await retry();
      clock.advance(10 * 60_000);

      await retry();
    });
  });

  describe('when the Sandbox stops part of the way', () => {
    const MINUTE = 60_000;
    /** 20 km is 2,000 s of driving, longer than a Sandbox runs untouched. */
    const FAR_M = 20_000;
    /** The seconds driven when it stops, 15 minutes after the request. */
    const DRIVEN_S = 900 - matchedAfterMs(FAR_M) / 1_000;

    it('carries on from where it was once resumed', async () => {
      const { after } = await requested(undefined, FAR_M);

      const resumed = await after(75 * MINUTE);

      expect(distanceM(resumed.driver, north(FAR_M - DRIVEN_S * 10))).toBeLessThan(1);
      expect(resumed.rideRequest.approach).toMatchObject({ status: 'driving', etaS: 2_000 - DRIVEN_S });
      const later = await after(100_000);
      expect(distanceM(later.driver, north(FAR_M - (DRIVEN_S + 100) * 10))).toBeLessThan(1);
      expect(later.rideRequest.approach).toMatchObject({ etaS: 1_900 - DRIVEN_S });
    });

    it('keeps all the distance driven when stopped more than once', async () => {
      const { after } = await requested(undefined, FAR_M);
      await after(75 * MINUTE);

      const again = await after(75 * MINUTE);

      expect(again.rideRequest.approach).toMatchObject({ status: 'driving', etaS: 1_100 - DRIVEN_S });
      expect((await after((1_100 - DRIVEN_S) * 1_000)).rideRequest.approach).toEqual({ status: 'arrived' });
    });

    it('sets off on a route that was found meanwhile only once resumed', async () => {
      let answer!: () => void;
      const slow = Object.assign(new StraightRoutingService(), { held: new Promise<void>((resolve) => (answer = resolve)) });
      const { clock, station, after } = await requested(slow);
      clock.advance(20 * MINUTE);
      answer();
      await settle();

      const resumed = await after(20 * MINUTE);

      expect(resumed.driver).toMatchObject({ lat: station.lat, lon: station.lon });
      expect(resumed.rideRequest.approach).toMatchObject({ status: 'driving', etaS: 100 });
    });
  });
});
