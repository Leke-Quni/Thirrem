import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeRoutingService } from './support/fake-routing.js';
import { createTestApp } from './support/app.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const dropoff = { lat: 42.3712, lon: 20.4219 };
const route = {
  distanceM: 1850,
  durationS: 240,
  geometry: [
    [20.4308, 42.3803],
    [20.427, 42.376],
    [20.4219, 42.3712],
  ] as Array<[number, number]>,
};

describe('Rider route between a Pickup Point and a Drop-off Point', () => {
  let app: INestApplication;
  let token: string;
  const routing = new FakeRoutingService(route);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ routing });
    const signup = await http().post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    token = signup.body.token;
  });
  afterAll(async () => {
    await app.close();
  });

  const ask = (body: unknown) => http().post('/rider/route').set('Authorization', `Bearer ${token}`).send(body as object);

  it('returns the route, distance and duration from the routing service', async () => {
    const res = await ask({ pickup, dropoff }).expect(200);

    expect(res.body).toEqual(route);
    expect(routing.requests.at(-1)).toEqual({ from: pickup, to: dropoff });
  });

  it('accepts a pin with no street name, because only coordinates are needed', async () => {
    const res = await ask({ pickup: { ...pickup, name: undefined }, dropoff }).expect(200);

    expect(res.body.distanceM).toBe(1850);
  });

  it('refuses a request with no session token', async () => {
    await http().post('/rider/route').send({ pickup, dropoff }).expect(401);
  });

  it('rejects missing, non-numeric or out-of-range coordinates', async () => {
    await ask({}).expect(400);
    await ask({ pickup, dropoff: { lat: 'x', lon: 1 } }).expect(400);
    await ask({ pickup, dropoff: { lat: 91, lon: 20 } }).expect(400);
    await ask({ pickup: { lat: 42, lon: 181 }, dropoff }).expect(400);
  });

  it('routes between pins anywhere in the world, not only in one city', async () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const lyon = { lat: 45.764, lon: 4.8357 };

    await ask({ pickup: paris, dropoff: lyon }).expect(200);

    expect(routing.requests.at(-1)).toEqual({ from: paris, to: lyon });
  });

  it('says so when the pins cannot be joined by road', async () => {
    const unreachable = await createTestApp({ routing: new FakeRoutingService(null) });
    const { body } = await request(unreachable.getHttpServer())
      .post('/rider/auth/signup')
      .send({ email: `rider-${randomUUID()}@example.com`, password });

    const res = await request(unreachable.getHttpServer())
      .post('/rider/route')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ pickup, dropoff })
      .expect(422);

    expect(res.body.message).toMatch(/no road route/i);
    await unreachable.close();
  });

  it('answers 503 with a plain message when the routing service is down', async () => {
    const down = await createTestApp({ routing: new FakeRoutingService(new Error('connect ECONNREFUSED')) });
    const { body } = await request(down.getHttpServer())
      .post('/rider/auth/signup')
      .send({ email: `rider-${randomUUID()}@example.com`, password });

    const res = await request(down.getHttpServer())
      .post('/rider/route')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ pickup, dropoff })
      .expect(503);

    expect(res.body.message).toMatch(/routing is unavailable/i);
    await down.close();
  });

  it('answers 429 when one client asks for too many routes in a minute', async () => {
    const limited = await createTestApp({ routing: new FakeRoutingService(route), routeRateLimit: { limit: 2, windowMs: 60_000 } });
    const { body } = await request(limited.getHttpServer())
      .post('/rider/auth/signup')
      .send({ email: `rider-${randomUUID()}@example.com`, password });
    const askLimited = () =>
      request(limited.getHttpServer()).post('/rider/route').set('Authorization', `Bearer ${body.token}`).send({ pickup, dropoff });

    await askLimited().expect(200);
    await askLimited().expect(200);
    const res = await askLimited().expect(429);

    expect(res.body.message).toMatch(/too many route requests/i);
    await limited.close();
  });
});
