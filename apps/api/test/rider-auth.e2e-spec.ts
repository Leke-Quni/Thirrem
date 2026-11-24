import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

const password = 'Correct-horse-battery';
const newEmail = () => `rider-${randomUUID()}@example.com`;

describe('Rider signup and login', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('signs a visitor up with email and password and returns a session token', async () => {
    const email = newEmail();

    const res = await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    expect(res.body.email).toBe(email);
    expect(res.body.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain(password);
  });

  it('logs in straight after signup with no email verification step', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    const res = await http().post('/rider/auth/login').send({ email, password }).expect(200);

    expect(res.body.email).toBe(email);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('lets a logged-in rider read their own account with the session token', async () => {
    const email = newEmail();
    const { body } = await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    const me = await http().get('/rider/me').set('Authorization', `Bearer ${body.token}`).expect(200);

    expect(me.body).toEqual({ email });
  });

  it('refuses a request with no session token, so there is no guest mode', async () => {
    await http().get('/rider/me').expect(401);
    await http().get('/rider/me').set('Authorization', 'Bearer not-a-real-token').expect(401);
  });

  it('rejects a wrong password and an unknown email with the same 401', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    const wrongPassword = await http().post('/rider/auth/login').send({ email, password: 'wrong-password-1' }).expect(401);
    const unknownEmail = await http().post('/rider/auth/login').send({ email: newEmail(), password }).expect(401);

    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('rejects a second signup with the same email, ignoring letter case', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    await http().post('/rider/auth/signup').send({ email: email.toUpperCase(), password }).expect(409);
  });

  it('rejects a malformed email and a short password', async () => {
    await http().post('/rider/auth/signup').send({ email: 'not-an-email', password }).expect(400);
    await http().post('/rider/auth/signup').send({ email: newEmail(), password: 'short' }).expect(400);
    await http().post('/rider/auth/signup').send({}).expect(400);
  });

  it('rejects a password with no uppercase letter or no special character, and says which is missing', async () => {
    const noUppercase = await http().post('/rider/auth/signup').send({ email: newEmail(), password: 'correct-horse-battery' }).expect(400);
    expect(noUppercase.body.message).toMatch(/uppercase letter/i);
    expect(noUppercase.body.message).not.toMatch(/special character/i);

    const noSpecial = await http().post('/rider/auth/signup').send({ email: newEmail(), password: 'CorrectHorseBattery1' }).expect(400);
    expect(noSpecial.body.message).toMatch(/special character/i);
    expect(noSpecial.body.message).not.toMatch(/uppercase letter/i);

    const short = await http().post('/rider/auth/signup').send({ email: newEmail(), password: 'Ab-1' }).expect(400);
    expect(short.body.message).toMatch(/at least 8 characters/i);
  });

  it('still lets a rider log in with a password that was valid before the stricter rules', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);
    await http().post('/rider/auth/login').send({ email, password }).expect(200);
  });

  it('keeps the account after the whole app is restarted, as it would after a Sandbox is discarded', async () => {
    const email = newEmail();
    await http().post('/rider/auth/signup').send({ email, password }).expect(201);

    const restarted = await createTestApp();
    try {
      await request(restarted.getHttpServer()).post('/rider/auth/login').send({ email, password }).expect(200);
    } finally {
      await restarted.close();
    }
  });
});
