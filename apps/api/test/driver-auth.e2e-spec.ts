import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_LIFETIME_MS } from '../src/auth/auth.service.js';
import { createTestApp, ManualClock } from './support/app.js';

const password = 'Correct-horse-battery';
const newEmail = () => `driver-${randomUUID()}@example.com`;

describe('Driver signup and login', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('signs a Driver up, logs them in and lets them read their own account', async () => {
    const email = newEmail();

    const signup = await http().post('/driver/auth/signup').send({ email, password }).expect(201);
    expect(signup.body).toEqual({ email, token: expect.any(String) });

    const login = await http().post('/driver/auth/login').send({ email, password }).expect(200);
    const me = await http().get('/driver/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    expect(me.body).toEqual({ email });
  });

  it('applies the same password rules as the Rider app', async () => {
    const res = await http().post('/driver/auth/signup').send({ email: newEmail(), password: 'short' }).expect(400);

    expect(res.body.message).toMatch(/at least 8 characters, an uppercase letter and a special character/);
  });

  it('refuses a request with no session token', async () => {
    await http().get('/driver/me').expect(401);
  });

  it('keeps Driver and Rider accounts separate, so one email can hold both', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    await http().post('/driver/auth/login').send({ email, password }).expect(401);
    await http().post('/driver/auth/signup').send({ email, password }).expect(201);
    await http().post('/driver/auth/signup').send({ email, password }).expect(409);
  });

  it('refuses a session from the other app', async () => {
    const rider = await http().post('/rider/auth/signup').send({ email: newEmail(), password }).expect(201);
    const driver = await http().post('/driver/auth/signup').send({ email: newEmail(), password }).expect(201);

    await http().get('/driver/me').set('Authorization', `Bearer ${rider.body.token}`).expect(401);
    await http().get('/rider/me').set('Authorization', `Bearer ${driver.body.token}`).expect(401);
  });

  it('keeps the account after the whole app is restarted', async () => {
    const email = newEmail();
    await http().post('/driver/auth/signup').send({ email, password }).expect(201);

    const restarted = await createTestApp();
    try {
      await request(restarted.getHttpServer()).post('/driver/auth/login').send({ email, password }).expect(200);
    } finally {
      await restarted.close();
    }
  });
});

describe('Driver account safety', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it('rejects an expired session', async () => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    app = await createTestApp({ clock });
    const http = () => request(app!.getHttpServer());
    const { body } = await http().post('/driver/auth/signup').send({ email: newEmail(), password }).expect(201);

    clock.advance(SESSION_LIFETIME_MS + 1000);

    await http().get('/driver/me').set('Authorization', `Bearer ${body.token}`).expect(401);
  });

  it('rate limits signup and login per client', async () => {
    app = await createTestApp({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const http = () => request(app!.getHttpServer());

    await http().post('/driver/auth/login').send({ email: newEmail(), password }).expect(401);
    await http().post('/driver/auth/login').send({ email: newEmail(), password }).expect(401);
    await http().post('/driver/auth/login').send({ email: newEmail(), password }).expect(429);
    await http().post('/driver/auth/signup').send({ email: newEmail(), password }).expect(429);
  });
});
