import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';
import { FakePlaceSearchService } from './support/fake-places.js';

const password = 'Correct-horse-battery';
const places = [
  { name: 'Rruga Bajram Curri', detail: 'Gjakovë, Kosovo', lat: 42.3803, lon: 20.4308 },
  { name: 'Bajram Curri Square', detail: 'Gjakovë, Kosovo', lat: 42.3791, lon: 20.4322 },
];

describe('Rider place search by street name', () => {
  let app: INestApplication;
  let token: string;
  const search = new FakePlaceSearchService(places);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ places: search });
    const signup = await http().post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    token = signup.body.token;
  });
  afterAll(async () => {
    await app.close();
  });

  const ask = (query: Record<string, string>) => http().get('/rider/places').query(query).set('Authorization', `Bearer ${token}`);

  it('returns named places with coordinates for a street name', async () => {
    const res = await ask({ q: 'Bajram Curri' }).expect(200);

    expect(res.body).toEqual(places);
    expect(search.searches.at(-1)).toEqual({ query: 'Bajram Curri', near: undefined });
  });

  it('prefers places near the Rider when a location is given', async () => {
    await ask({ q: 'Bajram Curri', lat: '42.38', lon: '20.43' }).expect(200);

    expect(search.searches.at(-1)?.near).toEqual({ lat: 42.38, lon: 20.43 });
  });

  it('returns an empty list, not an error, when nothing matches', async () => {
    const empty = await createTestApp({ places: new FakePlaceSearchService([]) });
    const { body } = await request(empty.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });

    const res = await request(empty.getHttpServer()).get('/rider/places').query({ q: 'zzzz' }).set('Authorization', `Bearer ${body.token}`).expect(200);

    expect(res.body).toEqual([]);
    await empty.close();
  });

  it('refuses a request with no session token', async () => {
    await http().get('/rider/places').query({ q: 'Bajram Curri' }).expect(401);
  });

  it('rejects a missing or too short search text, and one that is far too long', async () => {
    await ask({}).expect(400);
    await ask({ q: 'a' }).expect(400);
    await ask({ q: 'x'.repeat(200) }).expect(400);
  });

  it('rejects a location that is not a latitude and longitude', async () => {
    await ask({ q: 'Bajram', lat: 'north', lon: '20' }).expect(400);
    await ask({ q: 'Bajram', lat: '95', lon: '20' }).expect(400);
  });

  it('answers 503 with a plain message when the search service is down', async () => {
    const down = await createTestApp({ places: new FakePlaceSearchService(new Error('ECONNREFUSED')) });
    const { body } = await request(down.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });

    const res = await request(down.getHttpServer()).get('/rider/places').query({ q: 'Bajram' }).set('Authorization', `Bearer ${body.token}`).expect(503);

    expect(res.body.message).toMatch(/search is unavailable/i);
    await down.close();
  });

  it('answers 429 when one client searches too often in a minute', async () => {
    const limited = await createTestApp({ places: new FakePlaceSearchService(places), searchRateLimit: { limit: 2, windowMs: 60_000 } });
    const { body } = await request(limited.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    const askLimited = () => request(limited.getHttpServer()).get('/rider/places').query({ q: 'Bajram' }).set('Authorization', `Bearer ${body.token}`);

    await askLimited().expect(200);
    await askLimited().expect(200);
    const res = await askLimited().expect(429);

    expect(res.body.message).toMatch(/too many searches/i);
    await limited.close();
  });

  describe('street name at a point', () => {
    it('returns the street name and city at a pin, for the search box to show', async () => {
      const named = await createTestApp({ places: new FakePlaceSearchService([], 'Nëna Terezë, Gjakova') });
      const { body } = await request(named.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });

      const res = await request(named.getHttpServer()).get('/rider/places/reverse').query({ lat: '42.3803', lon: '20.4308' }).set('Authorization', `Bearer ${body.token}`).expect(200);

      expect(res.body).toEqual({ street: 'Nëna Terezë, Gjakova' });
      await named.close();
    });

    it('returns a null street, not an error, where the map has no street name', async () => {
      const res = await http().get('/rider/places/reverse').query({ lat: '42.35', lon: '20.52' }).set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toEqual({ street: null });
    });

    it('refuses a request with no session token and rejects bad coordinates', async () => {
      await http().get('/rider/places/reverse').query({ lat: '42.38', lon: '20.43' }).expect(401);
      await http().get('/rider/places/reverse').set('Authorization', `Bearer ${token}`).expect(400);
      await http().get('/rider/places/reverse').query({ lat: 'x', lon: '20' }).set('Authorization', `Bearer ${token}`).expect(400);
      await http().get('/rider/places/reverse').query({ lat: '95', lon: '20' }).set('Authorization', `Bearer ${token}`).expect(400);
    });

    it('answers 503 with a plain message when the lookup service is down', async () => {
      const down = await createTestApp({ places: new FakePlaceSearchService(new Error('ECONNREFUSED')) });
      const { body } = await request(down.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });

      const res = await request(down.getHttpServer()).get('/rider/places/reverse').query({ lat: '42.38', lon: '20.43' }).set('Authorization', `Bearer ${body.token}`).expect(503);

      expect(res.body.message).toMatch(/street name is unavailable/i);
      await down.close();
    });
  });
});
