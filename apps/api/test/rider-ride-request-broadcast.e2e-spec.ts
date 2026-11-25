import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { RideRequest, SimulatedDriver, VehicleType } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/app-config.js';
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
    const app = await createTestApp({ clock: new ManualClock(new Date('2026-01-01T00:00:00Z')), areas: new FixedAreaRepository({ centre: pickup, stations, paths: [] }), config });
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
    return { broadcast };
  };
  const namesOf = (...groups: Placed[][]) => groups.flat().map(({ name }) => name).sort();

  it('offers it only to Drivers of the requested Vehicle Type', async () => {
    const comfort = many(5, 'comfort', 0).map((driver) => ({ ...driver, vehicleType: 'comfort' as const }));
    const { broadcast } = await start([...many(5, 'economy', 0), ...comfort]);

    expect(await broadcast('comfort')).toEqual(namesOf(comfort));
  });

  it('searches the smallest cell holding 5 Drivers and the cells next to it', async () => {
    const inside = many(5, 'inside', 0);
    const nextTo = [...many(1, 'east', 1), ...many(1, 'north west', -1, -1)];
    const { broadcast } = await start([...inside, ...nextTo, ...many(1, 'two cells away', 2)]);

    expect(await broadcast()).toEqual(namesOf(inside, nextTo));
  });

  it('moves up to the parent cell when the smaller one holds only 4, however many are next to it', async () => {
    const inside = many(4, 'inside', 0);
    // In the next cell, which shares the parent, and in the parent's own neighbour.
    const wider = [...many(1, 'sibling', 1, 1), ...many(1, 'next to the parent', 3)];
    const { broadcast } = await start([...inside, ...wider, ...many(1, 'beyond', 4)]);

    expect(await broadcast()).toEqual(namesOf(inside, wider));
  });

  it('counts only Drivers of the requested Vehicle Type towards the 5', async () => {
    const economy = many(4, 'economy', 0);
    const xl = many(3, 'xl', 0).map((driver) => ({ ...driver, vehicleType: 'xl' as const }));
    const wider = many(1, 'economy further out', 3);
    const { broadcast } = await start([...economy, ...xl, ...wider]);

    expect(await broadcast()).toEqual(namesOf(economy, wider));
  });

  it('can be tuned to need fewer Drivers', async () => {
    const near = [...many(2, 'inside', 0), ...many(1, 'next to it', 1)];
    const { broadcast } = await start([...near, ...many(3, 'two cells away', 2)], { dispatch: { minDrivers: 2, acceptAfterMs: { min: 2_000, max: 8_000 } } });

    expect(await broadcast()).toEqual(namesOf(near));
  });

  it('stops widening at the largest area, offering it to whoever is there', async () => {
    // A level 10 cell is 64 level 16 cells across.
    const there = [...many(2, 'near', 0), ...many(1, 'far', 60)];
    const { broadcast } = await start([...there, ...many(1, 'out of reach', 200)]);

    expect(await broadcast()).toEqual(namesOf(there));
  });
});
