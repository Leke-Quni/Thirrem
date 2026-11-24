import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, ManualClock } from './support/app.js';
import { gjakovaFixture } from './fixtures/road-graph.js';

describe('API seam', () => {
  const clock = new ManualClock(new Date('2026-01-01T08:00:00.000Z'));
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ clock, roadGraph: gjakovaFixture });
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports a healthy API with a reachable database', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('reports simulation time from the controllable clock', async () => {
    const before = await request(app.getHttpServer()).get('/health').expect(200);
    expect(before.body.simulationTime).toBe('2026-01-01T08:00:00.000Z');

    clock.advance(30 * 60 * 1000);

    const after = await request(app.getHttpServer()).get('/health').expect(200);
    expect(after.body.simulationTime).toBe('2026-01-01T08:30:00.000Z');
  });

  it('serves the fixed road graph fixture', async () => {
    const res = await request(app.getHttpServer()).get('/road-graph').expect(200);
    expect(res.body).toEqual({ nodes: 6, edges: 7 });
  });
});
