import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FARE_RATES } from '../src/fares/fare-rates.js';
import { FakeRoutingService } from './support/fake-routing.js';
import { createTestApp } from './support/app.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const dropoff = { lat: 42.3712, lon: 20.4219 };
const route = { distanceM: 1850, durationS: 240, geometry: [[20.4308, 42.3803], [20.4219, 42.3712]] as Array<[number, number]> };

describe('Rider Fare quote for a Pickup Point and a Drop-off Point', () => {
  let app: INestApplication;
  let token: string;
  const routing = new FakeRoutingService(route);

  const signUp = async (target: INestApplication) => {
    const { body } = await request(target.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    return body.token as string;
  };
  const askOf = (target: INestApplication, session: string, body: object = { pickup, dropoff }) =>
    request(target.getHttpServer()).post('/rider/fare').set('Authorization', `Bearer ${session}`).send(body);

  beforeAll(async () => {
    app = await createTestApp({ routing });
    token = await signUp(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('quotes every Vehicle Type from the route distance and duration', async () => {
    const res = await askOf(app, token).expect(200);

    expect(res.body).toEqual({
      distanceM: 1850,
      durationS: 240,
      fares: [
        { vehicleType: 'economy', amountCents: 202, currency: 'EUR' },
        { vehicleType: 'comfort', amountCents: 279, currency: 'EUR' },
        { vehicleType: 'xl', amountCents: 364, currency: 'EUR' },
        { vehicleType: 'electric', amountCents: 279, currency: 'EUR' },
      ],
    });
    expect(routing.requests.at(-1)).toEqual({ from: pickup, to: dropoff });
  });

  it('takes its rates from the one configured place', async () => {
    const flat = { baseCents: 500, perKmCents: 0, perMinCents: 0, longDistancePerKmCents: 0 };
    const configured = await createTestApp({
      routing: new FakeRoutingService(route),
      config: { fareRates: { ...FARE_RATES, vehicleTypes: { economy: flat, comfort: flat, xl: flat, electric: flat } } },
    });

    const res = await askOf(configured, await signUp(configured)).expect(200);

    expect(res.body.fares.map((fare: { amountCents: number }) => fare.amountCents)).toEqual([500, 500, 500, 500]);
    await configured.close();
  });

  it('ignores a distance or Fare sent by the client', async () => {
    const res = await askOf(app, token, { pickup, dropoff, distanceM: 1, fares: [] }).expect(200);

    expect(res.body.distanceM).toBe(1850);
    expect(res.body.fares).toHaveLength(4);
  });

  it('refuses a request with no session token', async () => {
    await request(app.getHttpServer()).post('/rider/fare').send({ pickup, dropoff }).expect(401);
  });

  it('rejects missing, non-numeric or out-of-range coordinates', async () => {
    await askOf(app, token, {}).expect(400);
    await askOf(app, token, { pickup, dropoff: { lat: 'x', lon: 1 } }).expect(400);
    await askOf(app, token, { pickup: { lat: 42, lon: 181 }, dropoff }).expect(400);
  });

  it('says so when the pins cannot be joined by road', async () => {
    const unreachable = await createTestApp({ routing: new FakeRoutingService(null) });

    const res = await askOf(unreachable, await signUp(unreachable)).expect(422);

    expect(res.body.message).toMatch(/no road route/i);
    await unreachable.close();
  });

  it('answers 503 with a plain message when the routing service is down', async () => {
    const down = await createTestApp({ routing: new FakeRoutingService(new Error('connect ECONNREFUSED')) });

    const res = await askOf(down, await signUp(down)).expect(503);

    expect(res.body.message).toMatch(/routing is unavailable/i);
    await down.close();
  });

  it('limits Fare quotes per client without using up the route allowance', async () => {
    const limited = await createTestApp({ routing: new FakeRoutingService(route), routeRateLimit: { limit: 2, windowMs: 60_000 } });
    const session = await signUp(limited);

    await askOf(limited, session).expect(200);
    await askOf(limited, session).expect(200);
    const res = await askOf(limited, session).expect(429);
    await request(limited.getHttpServer()).post('/rider/route').set('Authorization', `Bearer ${session}`).send({ pickup, dropoff }).expect(200);

    expect(res.body.message).toMatch(/too many fare requests/i);
    await limited.close();
  });
});
