import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { SandboxResponse } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';
import { FixedAreaRepository } from './support/fixed-area.js';
import { StraightRoutingService } from './support/fake-routing.js';
import { InstantPacer, settle } from './support/pacers.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const dropoff = { lat: 42.39, lon: 20.45 };
const north = (metres: number) => ({ ...pickup, lat: pickup.lat + metres / 111_195 });
/** The only Driver is close enough to be asked at once, and accepts this long after. */
const ACCEPT_MS = 2_000;
/** So long that the Driver, once there, does not pick the Rider up partway through a test. */
const BOARDING_MS = 60 * 60_000;

describe('Cancelling a Ride Request', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** Lets searches for routes and paths get as far as they can. */
  const searched = async () => {
    for (let turn = 0; turn < 10; turn += 1) await settle();
  };

  /** A Rider with a running Sandbox whose only Driver is parked 100 m north of the Pickup Point. */
  const rider = async (routing = new StraightRoutingService(), roads = new FakeRoadService(), boardingMs = BOARDING_MS) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(100) };
    const app = await createTestApp({
      clock,
      routing,
      roads,
      pacer: new InstantPacer(),
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { dispatch: { acceptWindowMs: 9_000, acceptAfterMs: { min: ACCEPT_MS, max: ACCEPT_MS }, boardingMs } },
    });
    apps.push(app);
    const server = app.getHttpServer();
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    const authorization = `Bearer ${session.token}`;
    const open = async (fresh = false): Promise<SandboxResponse> => (await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup, fresh }).expect(200)).body;
    await open();
    const requestRide = async (status = 201, vehicleType = 'economy') => {
      const res = await request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup, dropoff, vehicleType }).expect(status);
      await searched();
      return res;
    };
    /** As the app cancels once the Rider has agreed to any pause, unless `query` says otherwise. */
    const cancel = async (status = 204, query = '?pause=accepted') => {
      const res = await request(server).delete(`/rider/ride-requests${query}`).set('Authorization', authorization).expect(status);
      await searched();
      return res;
    };
    /** The Sandbox `ms` later. */
    const after = async (ms: number) => {
      clock.advance(ms);
      return open();
    };
    return { server, clock, station, open, requestRide, cancel, after };
  };

  const MINUTE = 60_000;
  const GRACE_MS = 30_000;
  /** A Rider whose released Drivers stay parked close by, so every further Ride Request is matched at once. */
  const frequentCanceller = async (routing?: StraightRoutingService, boardingMs?: number) => {
    const roads = new FakeRoadService(new Error('No new paths'));
    const made = await rider(routing, roads, boardingMs);
    /** Requests a Ride and cancels it `matchedForMs` after the match. */
    const cancelAfterMatch = async (matchedForMs: number) => {
      await made.requestRide();
      made.clock.advance(ACCEPT_MS + matchedForMs);
      await made.cancel();
    };
    const quickCancels = async (times: number) => {
      for (let n = 0; n < times; n += 1) await cancelAfterMatch(0);
    };
    const lateCancels = async (times: number) => {
      for (let n = 0; n < times; n += 1) await cancelAfterMatch(GRACE_MS);
    };
    const pausedForS = async () => (await made.open()).requestsPausedForS;
    return { ...made, cancelAfterMatch, quickCancels, lateCancels, pausedForS };
  };

  describe('while searching', () => {
    it('removes it, and no Driver is matched later', async () => {
      const { requestRide, cancel, after } = await rider();
      await requestRide();

      await cancel();

      const { rideRequest, drivers } = await after(ACCEPT_MS);
      expect(rideRequest).toBeNull();
      expect(drivers[0]!.available).toBe(true);
    });

    it('lets the Rider request another', async () => {
      const { requestRide, cancel, after } = await rider();
      await requestRide();
      await cancel();

      await requestRide();

      expect((await after(ACCEPT_MS)).rideRequest).toMatchObject({ status: 'matched' });
    });
  });

  describe('while the Driver is approaching', () => {
    it.each([
      ['on the way', 4_000],
      ['waiting at the Pickup Point', 60_000],
    ])('releases the Driver where it is: %s', async (_, drivingMs) => {
      const { requestRide, cancel, after } = await rider();
      await requestRide();
      const before = (await after(ACCEPT_MS + drivingMs)).drivers[0]!;

      await cancel();

      const { rideRequest, drivers } = await after(0);
      expect(rideRequest).toBeNull();
      expect(drivers[0]).toMatchObject({ id: before.id, available: true });
      expect(distanceM(drivers[0]!, before)).toBeLessThan(0.01);
    });

    it('sends the released Driver driving again from where it is', async () => {
      const { requestRide, cancel, after } = await rider();
      await requestRide();
      const released = (await after(ACCEPT_MS + 4_000)).drivers[0]!;

      await cancel();

      const later = (await after(5_000)).drivers[0]!;
      expect(distanceM(later, released)).toBeGreaterThan(10);
      // A Driver covers under 12 m/s on these roads, so it did not jump anywhere.
      expect(distanceM(later, released)).toBeLessThan(60);
    });

    it('leaves the released Driver parked while no road path can be had, and looks again as the Sandbox is opened', async () => {
      const roads = new FakeRoadService(new Error('The road service is down'));
      const { requestRide, cancel, after } = await rider(undefined, roads);
      await requestRide();
      const before = (await after(ACCEPT_MS + 4_000)).drivers[0]!;
      await cancel();
      const parked = (await after(60_000)).drivers[0]!;
      expect(distanceM(parked, before)).toBeLessThan(0.01);
      expect(parked.heading).toBeCloseTo(before.heading, 5);
      roads.failure = undefined;
      await after(0);
      await searched();

      const later = (await after(5_000)).drivers[0]!;

      expect(distanceM(later, before)).toBeGreaterThan(10);
    });

    it('can match the released Driver again, starting from where it is', async () => {
      const routing = new StraightRoutingService();
      const { requestRide, cancel, after } = await rider(routing);
      await requestRide();
      await after(ACCEPT_MS + 4_000);
      await cancel();

      await requestRide();

      const { rideRequest, drivers } = await after(ACCEPT_MS);
      expect(rideRequest).toMatchObject({ status: 'matched', driver: { id: drivers[0]!.id } });
      expect(distanceM(routing.requests.at(-1)!.from, pickup)).toBeLessThan(100);
    });
  });

  describe('too often', () => {
    it.each([
      ['2 late cancels', 0, 2],
      ['4 quick cancels', 4, 0],
      ['4 quick and 2 late cancels, which are counted apart', 4, 2],
    ])('does not pause Ride Requests after %s', async (_, quick, late) => {
      const { quickCancels, lateCancels, pausedForS, requestRide } = await frequentCanceller();
      await quickCancels(quick);
      await lateCancels(late);

      expect(await pausedForS()).toBeNull();
      await requestRide();
    });

    it.each([
      ['3 late cancels', 0, 3],
      ['5 quick cancels', 5, 0],
    ])('pauses Ride Requests for 15 minutes after %s', async (_, quick, late) => {
      const { quickCancels, lateCancels, pausedForS, requestRide } = await frequentCanceller();
      await quickCancels(quick);
      await lateCancels(late);

      expect(await pausedForS()).toBe(15 * 60);
      const refused = await requestRide(429);
      expect(refused.body).toEqual({ code: 'RIDE_REQUESTS_PAUSED', message: 'Ride Requests are paused after too many cancellations. Try again in 15 minutes.' });
    });

    it('allows Ride Requests again once the 15 minutes have passed', async () => {
      const { lateCancels, clock, requestRide, after } = await frequentCanceller();
      await lateCancels(3);
      clock.advance(15 * MINUTE - 1);
      expect((await requestRide(429)).body.message).toMatch(/try again in 1 minute\./i);

      expect((await after(1)).requestsPausedForS).toBeNull();

      await requestRide();
    });

    it.each([
      ['just inside', 30 * MINUTE - 1, 15 * 60],
      ['just outside', 30 * MINUTE, null],
    ])('counts cancels from the last 30 minutes only: %s', async (_, sinceFirstMs, paused) => {
      const { lateCancels, clock, after, pausedForS } = await frequentCanceller();
      await lateCancels(1);
      await lateCancels(1);
      // The first was cancelled one whole late cancel, 32 seconds, before this.
      await after(sinceFirstMs - 2 * (ACCEPT_MS + GRACE_MS));

      await lateCancels(1);

      expect(await pausedForS()).toBe(paused);
    });

    it('never counts cancelling while still searching', async () => {
      const { requestRide, cancel, pausedForS } = await frequentCanceller();
      for (let n = 0; n < 8; n += 1) {
        await requestRide();
        await cancel();
      }

      expect(await pausedForS()).toBeNull();
    });

    it('does not count cancelling when no route to the Pickup Point could be found', async () => {
      const down = Object.assign(new StraightRoutingService(), { outcome: 'down' as const });
      const { lateCancels, pausedForS } = await frequentCanceller(down);

      await lateCancels(3);

      expect(await pausedForS()).toBeNull();
    });

    it('keeps the pause when the Rider starts a new Sandbox', async () => {
      const { lateCancels, open, requestRide } = await frequentCanceller();
      await lateCancels(3);

      expect((await open(true)).requestsPausedForS).toBe(15 * 60);

      await requestRide(429);
    });

    it('pauses only the Rider who cancelled', async () => {
      const { server, lateCancels } = await frequentCanceller();
      await lateCancels(3);
      const { body: other } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });

      const sandbox = await request(server).put('/rider/sandbox').set('Authorization', `Bearer ${other.token}`).send({ centre: pickup }).expect(200);

      expect(sandbox.body.requestsPausedForS).toBeNull();
    });
  });

  describe('until one more would pause Ride Requests', () => {
    it.each([
      ['1 late cancel', 0, 1],
      ['3 quick cancels', 3, 0],
    ])('gives no warning after %s', async (_, quick, late) => {
      const { quickCancels, lateCancels, open } = await frequentCanceller();
      await quickCancels(quick);
      await lateCancels(late);

      expect((await open()).cancelWarningAtMs).toBeNull();
    });

    it.each([
      ['the 2nd late cancel', 0, 2],
      ['the 4th quick cancel', 4, 0],
    ])('warns as of %s', async (_, quick, late) => {
      const { quickCancels, lateCancels, open, clock } = await frequentCanceller();
      await quickCancels(quick);
      await lateCancels(late);

      expect((await open()).cancelWarningAtMs).toBe(clock.now().getTime());
    });

    it('warns as of starting a new Sandbox that leaves one cancel more', async () => {
      const { lateCancels, requestRide, after, open, clock } = await frequentCanceller();
      await lateCancels(1);
      await requestRide();
      await after(ACCEPT_MS + GRACE_MS);

      expect((await open(true)).cancelWarningAtMs).toBe(clock.now().getTime());
    });

    it('does not warn again for a cancel of the other kind, or for the one that pauses', async () => {
      const { quickCancels, lateCancels, open } = await frequentCanceller();
      await lateCancels(2);
      const warnedAtMs = (await open()).cancelWarningAtMs;

      await quickCancels(1);
      expect((await open()).cancelWarningAtMs).toBe(warnedAtMs);
      await lateCancels(1);

      expect((await open()).cancelWarningAtMs).toBe(warnedAtMs);
    });
  });

  describe('when it would pause Ride Requests', () => {
    it('is refused unless the Rider has accepted the pause, leaving the Ride Request open', async () => {
      const { lateCancels, requestRide, cancel, after, clock } = await frequentCanceller();
      await lateCancels(2);
      await requestRide();
      clock.advance(ACCEPT_MS + GRACE_MS);

      const res = await cancel(409, '');

      expect(res.body).toEqual({ code: 'CANCEL_WOULD_PAUSE', message: 'Cancelling now would pause your Ride Requests for 15 minutes.' });
      const sandbox = await after(0);
      expect(sandbox.rideRequest).toMatchObject({ status: 'matched' });
      expect(sandbox.requestsPausedForS).toBeNull();
    });

    it('needs no acceptance when it would not', async () => {
      const { requestRide, cancel, clock } = await frequentCanceller();
      await requestRide();
      clock.advance(ACCEPT_MS + GRACE_MS);

      await cancel(204, '');
    });
  });

  describe('by starting a new Sandbox', () => {
    it('counts as a cancel once a Driver is matched', async () => {
      const { requestRide, after, open, pausedForS } = await frequentCanceller();
      for (let n = 0; n < 3; n += 1) {
        await requestRide();
        await after(ACCEPT_MS + GRACE_MS);
        await open(true);
      }

      expect(await pausedForS()).toBe(15 * 60);
    });

    it('counts when the Sandbox had stopped', async () => {
      const { lateCancels, requestRide, clock, open, pausedForS } = await frequentCanceller();
      await lateCancels(2);
      await requestRide();
      clock.advance(16 * MINUTE);

      await open(true);

      expect(await pausedForS()).toBe(15 * 60);
    });

    it('counts when the Sandbox stopped before the Rider could be picked up', async () => {
      const { lateCancels, requestRide, clock, open, pausedForS } = await frequentCanceller(undefined, 20 * MINUTE);
      await lateCancels(2);
      await requestRide();
      // By the clock alone the Rider would have been picked up, but nothing happens while a Sandbox is stopped.
      clock.advance(25 * MINUTE);

      await open(true);

      expect(await pausedForS()).toBe(15 * 60);
    });

    it('does not count during a Ride', async () => {
      const { requestRide, after, open, pausedForS } = await frequentCanceller(undefined, GRACE_MS);
      for (let n = 0; n < 3; n += 1) {
        await requestRide();
        expect((await after(ACCEPT_MS + MINUTE)).ride).not.toBeNull();
        await open(true);
      }

      expect(await pausedForS()).toBeNull();
    });

    it('does not count while still searching', async () => {
      const { requestRide, open, pausedForS } = await frequentCanceller();
      for (let n = 0; n < 8; n += 1) {
        await requestRide();
        await open(true);
      }

      expect(await pausedForS()).toBeNull();
    });
  });

  describe('as the Rider is told of it', () => {
    it('costs nothing while searching', async () => {
      const { requestRide } = await frequentCanceller();

      const { body } = await requestRide();

      expect(body.cancellation).toEqual({ counts: null, quickForS: null, pausesRequests: false });
    });

    it.each([
      ['at the match', 0, { counts: 'quick', quickForS: 30 }],
      ['just before 30 seconds', GRACE_MS - 1, { counts: 'quick', quickForS: 1 }],
      ['from 30 seconds on', GRACE_MS, { counts: 'late', quickForS: null }],
    ])('says how it would count: %s', async (_, matchedForMs, expected) => {
      const { requestRide, after } = await frequentCanceller();
      await requestRide();

      const { rideRequest } = await after(ACCEPT_MS + matchedForMs);

      expect(rideRequest!.cancellation).toEqual({ ...expected, pausesRequests: false });
    });

    it.each([
      ['a quick cancel', 4, 0, 0],
      ['a late cancel', 0, 2, GRACE_MS],
    ])('warns when %s would pause Ride Requests', async (_, quick, late, matchedForMs) => {
      const { quickCancels, lateCancels, requestRide, after } = await frequentCanceller();
      await quickCancels(quick);
      await lateCancels(late);
      await requestRide();

      const { rideRequest } = await after(ACCEPT_MS + matchedForMs);

      expect(rideRequest!.cancellation).toMatchObject({ pausesRequests: true });
    });

    it('is not offered once the Ride Request has failed', async () => {
      const { requestRide, after } = await frequentCanceller();
      await requestRide(201, 'xl');

      expect((await after(63_000)).rideRequest!.cancellation).toBeNull();
    });
  });

  describe('is refused', () => {
    it('without an open Ride Request', async () => {
      const { cancel } = await rider();

      expect((await cancel(409)).body.message).toMatch(/no open Ride Request/i);
    });

    it('once the Ride Request has failed', async () => {
      const { requestRide, cancel, after } = await rider();
      await requestRide(201, 'xl');
      await after(63_000);

      expect((await cancel(409)).body.message).toMatch(/no open Ride Request/i);
    });

    it('once the Rider has been picked up', async () => {
      const { requestRide, cancel, after } = await rider(undefined, undefined, GRACE_MS);
      await requestRide();
      const { ride } = await after(ACCEPT_MS + MINUTE);

      expect((await cancel(409)).body.message).toMatch(/no open Ride Request/i);
      expect((await after(0)).ride?.id).toBe(ride!.id);
    });

    it('when the Sandbox has stopped', async () => {
      const { requestRide, cancel, clock } = await rider();
      await requestRide();
      clock.advance(20 * 60_000);

      expect((await cancel(409)).body.message).toMatch(/not running/i);
    });

    it('without a session token', async () => {
      const { server } = await rider();

      await request(server).delete('/rider/ride-requests').expect(401);
    });
  });
});
