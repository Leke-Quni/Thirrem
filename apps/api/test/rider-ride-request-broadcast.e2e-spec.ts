import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { RideRequest, SandboxResponse, SimulatedDriver, VehicleType } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppConfig, loadConfig } from '../src/config/app-config.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FixedAreaRepository } from './support/fixed-area.js';

const password = 'Correct-horse-battery';
const dropoff = { lat: 42.39, lon: 20.45 };

/** An even numbered level 16 cell near Gjakova, so that the cell east and south of it shares its parent. */
const X = 36486;
const Y = 24234;

/** A point inside the level 16 quadtree cell `east` and `south` of the Pickup Point's. */
function inCell(east: number, south: number, share = 0.5) {
  const size = 2 ** 16;
  const y = (Y + south + share) / size;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI, lon: ((X + east + share) / size) * 360 - 180 };
}

const pickup = inCell(0, 0);

interface Placed {
  name: string;
  east: number;
  south?: number;
  vehicleType?: VehicleType;
}

const many = (count: number, name: string, east: number, south = 0): Placed[] => Array.from({ length: count }, (_, index) => ({ name: `${name} ${index}`, east, south }));

describe('Broadcasting a Ride Request', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** A Rider with a Sandbox whose Drivers are parked exactly where the test puts them. */
  const start = async (placed: Placed[], config: Partial<AppConfig> = {}) => {
    const stations = placed.map(({ east, south = 0, vehicleType = 'economy' }, index) => ({ vehicleType, heading: 0, ...inCell(east, south, 0.2 + index * 0.02) }));
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    // These tests are about the Ride Request, so its Driver never gets as far as picking the Rider up.
    const dispatch = { ...(config.dispatch ?? loadConfig().dispatch), boardingMs: 86_400_000 };
    const app = await createTestApp({ clock, areas: new FixedAreaRepository({ centre: pickup, stations, paths: [] }), config: { ...config, dispatch } });
    apps.push(app);
    const server = app.getHttpServer();
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    const authorization = `Bearer ${session.token}`;
    const opened = await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup }).expect(200);
    const drivers: SimulatedDriver[] = opened.body.drivers;
    const names = new Map(drivers.map((driver, index) => [driver.id, placed[index]!.name]));
    /** The names of the Drivers a request for this Vehicle Type is broadcast to. */
    const broadcast = async (vehicleType: VehicleType = 'economy') => {
      const res = await request(server).post('/rider/ride-requests').set('Authorization', authorization).send({ pickup, dropoff, vehicleType }).expect(201);
      return (res.body as RideRequest).offers.map((offer) => names.get(offer.driverId)).sort();
    };
    const look = async (): Promise<SandboxResponse> => (await request(server).put('/rider/sandbox').set('Authorization', authorization).send({ centre: pickup }).expect(200)).body;
    /** The names of the Drivers it has been broadcast to by now. */
    const offered = async () => (await look()).rideRequest!.offers.map((offer) => names.get(offer.driverId)).sort();
    return { broadcast, offered, look, clock };
  };
  /** The standard dispatch, but with no Driver answering inside the accept window. */
  const unanswered = { dispatch: { ...loadConfig().dispatch, acceptAfterMs: { min: 60_000_000, max: 60_000_000 } } };
  const namesOf = (...groups: Placed[][]) => groups.flat().map(({ name }) => name).sort();

  it('offers it only to Drivers of the requested Vehicle Type', async () => {
    const comfort = many(5, 'comfort', 0).map((driver) => ({ ...driver, vehicleType: 'comfort' as const }));
    const { broadcast } = await start([...many(5, 'economy', 0), ...comfort]);

    expect(await broadcast('comfort')).toEqual(namesOf(comfort));
  });

  it('first asks the Drivers in the smallest cell and the cells next to it, however few they are', async () => {
    const near = [...many(1, 'inside', 0), ...many(1, 'east', 1), ...many(1, 'north west', -1, -1)];
    const { broadcast } = await start([...near, ...many(5, 'two cells away', 2)]);

    expect(await broadcast()).toEqual(namesOf(near));
  });

  it('widens to the parent cell when nobody has accepted within 9 seconds', async () => {
    const near = many(1, 'inside', 0);
    const wider = many(1, 'next to the parent', 3);
    const { broadcast, offered, clock } = await start([...near, ...wider, ...many(1, 'beyond', 4)], unanswered);
    await broadcast();

    clock.advance(8_999);
    expect(await offered()).toEqual(namesOf(near));
    clock.advance(1);

    expect(await offered()).toEqual(namesOf(near, wider));
  });

  it('widens one level for each window that passes, up to the largest', async () => {
    // Each is first reached by one area: from level 16 in the first window to level 10 in the seventh.
    const reached = [0, 3, 5, 9, 20, 40, 100].map((east, window) => ({ name: `window ${window}`, east }));
    const { broadcast, offered, clock } = await start([...reached, ...many(1, 'out of reach', 200)], unanswered);
    expect(await broadcast()).toEqual(namesOf(reached.slice(0, 1)));

    for (let window = 1; window < reached.length; window += 1) {
      clock.advance(9_000);
      expect(await offered()).toEqual(namesOf(reached.slice(0, window + 1)));
    }
  });

  it('matches a Driver who is only reached once the search has widened', async () => {
    const { broadcast, look, clock } = await start(many(1, 'next to the parent', 3));
    expect(await broadcast()).toEqual([]);

    clock.advance(10_999);
    expect((await look()).rideRequest!.status).toBe('searching');
    clock.advance(6_001);

    expect((await look()).rideRequest).toMatchObject({ status: 'matched', offers: [{ status: 'accepted' }] });
  });

  it('can be tuned to wait longer before widening', async () => {
    const near = many(1, 'inside', 0);
    const wider = many(1, 'next to the parent', 3);
    const { broadcast, offered, clock } = await start([...near, ...wider], { dispatch: { ...unanswered.dispatch, acceptWindowMs: 30_000 } });
    await broadcast();

    clock.advance(29_999);
    expect(await offered()).toEqual(namesOf(near));
    clock.advance(1);

    expect(await offered()).toEqual(namesOf(near, wider));
  });

  it('is not widened once a Driver has accepted', async () => {
    const near = many(1, 'inside', 0);
    const { broadcast, offered, clock } = await start([...near, ...many(1, 'next to the parent', 3)]);
    await broadcast();

    clock.advance(60_000);

    expect(await offered()).toEqual(namesOf(near));
  });

  it('fails once the windows of all seven areas, 63 seconds in all, have passed', async () => {
    const { broadcast, look, clock } = await start(many(5, 'inside', 0), unanswered);
    await broadcast();

    clock.advance(62_999);
    expect((await look()).rideRequest!.status).toBe('searching');
    clock.advance(1);

    const { rideRequest, drivers } = await look();
    expect(rideRequest).toMatchObject({ status: 'failed', driver: null });
    expect(rideRequest!.offers.map((offer) => offer.status)).toEqual(Array(5).fill('withdrawn'));
    expect(drivers.every((driver) => driver.available)).toBe(true);
  });

  it('fails when there is no Driver to ask', async () => {
    const { broadcast, look, clock } = await start(many(1, 'out of reach', 200));
    expect(await broadcast()).toEqual([]);

    clock.advance(63_000);

    expect((await look()).rideRequest).toMatchObject({ status: 'failed', offers: [], driver: null });
  });
});
