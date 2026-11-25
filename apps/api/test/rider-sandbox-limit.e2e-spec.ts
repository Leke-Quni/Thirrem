import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/app-config.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };
const MINUTE = 60_000;
const busy = { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' };

describe('The limit on running Sandboxes', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const start = async (config: Partial<AppConfig> = {}) => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    const roads = new FakeRoadService();
    const app = await createTestApp({ clock, roads, config });
    apps.push(app);
    const rider = async () => {
      const { body } = await request(app.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
      return body.token as string;
    };
    const open = (token: string, body: { centre?: Coordinate; fresh?: boolean } = {}) =>
      request(app.getHttpServer()).put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send({ centre, ...body });
    /** A new Rider with a running Sandbox. */
    const running = async () => {
      const token = await rider();
      const res = await open(token).expect(200);
      return { token, drivers: res.body.drivers as SimulatedDriver[] };
    };
    return { clock, roads, rider, open, running };
  };

  const ids = (drivers: SimulatedDriver[]) => drivers.map((driver) => driver.id);

  it('runs 30 Sandboxes at once, and tells the next Rider it is busy', async () => {
    const { rider, open, running } = await start();
    for (let count = 0; count < 30; count += 1) await running();

    const res = await open(await rider());

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject(busy);
  });

  it('gives the place of a stopped Sandbox to the next Rider', async () => {
    const { clock, rider, open, running } = await start({ sandboxLimit: 2 });
    await running();
    clock.advance(MINUTE);
    await running();
    const next = await rider();
    await open(next).expect(503);

    clock.advance(14 * MINUTE);

    await open(next).expect(200);
    await open(await rider()).expect(503);
  });

  it('does not resume a stopped Sandbox while every place is taken, and keeps it for later', async () => {
    const { clock, open, running } = await start({ sandboxLimit: 1 });
    const first = await running();
    clock.advance(15 * MINUTE);
    await running();

    expect((await open(first.token).expect(503)).body).toMatchObject(busy);
    clock.advance(15 * MINUTE);
    const resumed = await open(first.token).expect(200);

    expect(ids(resumed.body.drivers)).toEqual(ids(first.drivers));
  });

  it('does not replace a stopped Sandbox with a new one while every place is taken', async () => {
    const { clock, open, running } = await start({ sandboxLimit: 1 });
    const first = await running();
    clock.advance(15 * MINUTE);
    await running();

    await open(first.token, { fresh: true }).expect(503);
  });

  const ways: Array<[string, { centre?: Coordinate; fresh?: boolean }]> = [
    ['open it again', {}],
    ['start a new one', { fresh: true }],
    ['move it', { centre: { lat: 48.8566, lon: 2.3522 } }],
  ];
  it.each(ways)('lets a Rider with a running Sandbox %s while every place is taken', async (_, body) => {
    const { open, running } = await start({ sandboxLimit: 1 });
    const { token } = await running();

    await open(token, body).expect(200);
  });

  it('gives the last place to only one of the Riders who arrive together', async () => {
    const { rider, open } = await start({ sandboxLimit: 1 });
    const tokens = [await rider(), await rider(), await rider()];

    const answers = await Promise.all(tokens.map((token) => open(token)));

    expect(answers.map((res) => res.status).sort()).toEqual([200, 503, 503]);
  });

  it('asks nothing of the road service for a Rider it turns away', async () => {
    const { roads, rider, open, running } = await start({ sandboxLimit: 1 });
    await running();
    const before = roads.requests.length;

    await open(await rider(), { centre: { lat: 48.8566, lon: 2.3522 } }).expect(503);

    expect(roads.requests).toHaveLength(before);
  });
});
