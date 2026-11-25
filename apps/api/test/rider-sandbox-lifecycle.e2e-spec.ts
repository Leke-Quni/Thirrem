import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import { distanceM } from '../src/sandbox/driver-placement.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';
import { InstantPacer, ManualPacer, settle } from './support/pacers.js';
import type { Pacer } from '../src/sandbox/pacer.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const MINUTE = 60_000;

describe("The life of a Rider's Sandbox", () => {
  const apps: INestApplication[] = [];
  const sockets: WebSocket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const start = async <P extends Pacer>(pacer: P) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const roads = new FakeRoadService();
    const app = await createTestApp({ clock, roads, pacer, config: { live: { intervalMs: 20, helloTimeoutMs: 200 } } });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    const rider = async () => {
      const { body } = await request(app.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
      return body.token as string;
    };
    const drivers = async (token: string, at: Coordinate = centre): Promise<SimulatedDriver[]> => {
      const res = await request(app.getHttpServer()).put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send({ centre: at }).expect(200);
      await settle();
      return res.body.drivers;
    };
    /** The next thing the live feed says: positions, or why it closed. */
    const watch = (token: string) => {
      const socket = new WebSocket(`ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/rider/live`);
      sockets.push(socket);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ event: 'watch', data: { token } })));
      const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
      const first = Promise.race([
        closed,
        new Promise<SimulatedDriver[]>((resolve) => socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data)).data.drivers), { once: true })),
      ]);
      return { first, closed };
    };
    const allPathsReady = async (token: string) => {
      await drivers(token);
      for (let asked = -1; asked !== roads.routeRequests.length; ) {
        asked = roads.routeRequests.length;
        for (let turn = 0; turn < 10; turn += 1) await settle();
      }
    };
    return { app, clock, roads, pacer, rider, drivers, watch, allPathsReady };
  };
  const ids = (drivers: SimulatedDriver[]) => drivers.map((driver) => driver.id);
  const furthestM = (before: SimulatedDriver[], after: SimulatedDriver[]) => Math.max(...after.map((driver, index) => distanceM(before[index]!, driver)));

  it('keeps running until 15 minutes pass without activity', async () => {
    const { clock, rider, drivers, watch } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);

    clock.advance(15 * MINUTE - 1);

    expect(await watch(token).first).toHaveLength(40);
  });

  it('stops after 15 minutes without activity, and says so on the live feed', async () => {
    const { clock, rider, drivers, watch } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);
    const feed = watch(token);
    await feed.first;

    clock.advance(15 * MINUTE);

    expect(await feed.closed).toBe(4410);
    expect(await watch(token).first).toBe(4410);
  });

  it('does not count watching the live feed as activity', async () => {
    const { clock, rider, drivers, watch } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);
    clock.advance(10 * MINUTE);
    const feed = watch(token);
    await feed.first;

    clock.advance(5 * MINUTE);

    expect(await feed.closed).toBe(4410);
  });

  it('starts the 15 minutes again each time the Sandbox is opened', async () => {
    const { clock, rider, drivers, watch } = await start(new InstantPacer());
    const token = await rider();
    await drivers(token);
    clock.advance(10 * MINUTE);
    await drivers(token);

    clock.advance(10 * MINUTE);

    expect(await watch(token).first).toHaveLength(40);
  });

  it('resumes the same Drivers from where they stopped when the Rider comes back', async () => {
    const { clock, rider, drivers, watch, allPathsReady } = await start(new InstantPacer());
    const token = await rider();
    await allPathsReady(token);
    const early = await drivers(token);
    clock.advance(15 * MINUTE - 1);
    const lastSeen = (await watch(token).first) as SimulatedDriver[];
    expect(furthestM(early, lastSeen)).toBeGreaterThan(100);

    clock.advance(60 * MINUTE);
    const resumed = await drivers(token);

    expect(ids(resumed)).toEqual(ids(early));
    expect(furthestM(lastSeen, resumed)).toBeLessThan(1);
    clock.advance(10_000);
    const later = await drivers(token);
    for (const [index, driver] of later.entries()) {
      // A Driver that has just turned back can be where it was, but facing another way.
      expect(driver).not.toEqual(resumed[index]);
      expect(distanceM(resumed[index]!, driver)).toBeLessThan(120);
    }
  });

  it('sets off a Driver whose path arrived while the Sandbox was stopped from where it was parked', async () => {
    const { clock, pacer, rider, drivers } = await start(new ManualPacer());
    const token = await rider();
    const parked = await drivers(token);
    clock.advance(30 * MINUTE);
    await pacer.step();

    const resumed = await drivers(token);
    expect(distanceM(parked[1]!, resumed[1]!)).toBeLessThan(1);
    clock.advance(10_000);
    const later = await drivers(token);

    expect(distanceM(parked[1]!, later[1]!)).toBeGreaterThan(80);
    expect(distanceM(parked[1]!, later[1]!)).toBeLessThan(120);
  });
});
