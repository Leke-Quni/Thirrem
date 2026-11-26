import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, ManualClock } from './support/app.js';

const password = 'Correct-horse-battery';
const newEmail = () => `driver-${randomUUID()}@example.com`;
const choice = { vehicleType: 'comfort', model: 'Škoda Superb', colour: 'Blue' };

async function signedUpDriver(app: INestApplication) {
  const email = newEmail();
  const { body } = await request(app.getHttpServer()).post('/driver/auth/signup').send({ email, password }).expect(201);
  return { email, authorization: `Bearer ${body.token}` };
}

describe('Driver vehicle registration', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('has no vehicle for a new Driver', async () => {
    const { authorization } = await signedUpDriver(app);

    const res = await http().get('/driver/vehicle').set('Authorization', authorization).expect(200);

    expect(res.body).toEqual({ vehicle: null });
  });

  it('offers models for each Vehicle Type and a list of colours', async () => {
    const res = await http().get('/driver/vehicle-options').expect(200);

    expect(Object.keys(res.body.models)).toEqual(['economy', 'comfort', 'xl', 'electric']);
    expect(res.body.models.comfort).toContain('Škoda Superb');
    expect(res.body.colours).toContain('Blue');
  });

  it('registers one vehicle with a Vehicle Type and a made-up plate, pending approval', async () => {
    const { authorization } = await signedUpDriver(app);

    const created = await http().post('/driver/vehicle').set('Authorization', authorization).send(choice).expect(201);

    expect(created.body).toEqual({ vehicle: { ...choice, plate: expect.stringMatching(/^TH-\d{3}-[A-Z]{2}$/), status: 'pending' } });
    const read = await http().get('/driver/vehicle').set('Authorization', authorization).expect(200);
    expect(read.body).toEqual(created.body);
  });

  it('ignores a plate sent by the Driver', async () => {
    const { authorization } = await signedUpDriver(app);

    const res = await http().post('/driver/vehicle').set('Authorization', authorization).send({ ...choice, plate: '01-123-AB' }).expect(201);

    expect(res.body.vehicle.plate).toMatch(/^TH-/);
  });

  it('refuses a second vehicle and keeps the first', async () => {
    const { authorization } = await signedUpDriver(app);
    const first = await http().post('/driver/vehicle').set('Authorization', authorization).send(choice).expect(201);

    const second = await http()
      .post('/driver/vehicle')
      .set('Authorization', authorization)
      .send({ vehicleType: 'xl', model: 'Ford Galaxy', colour: 'Red' })
      .expect(409);

    expect(second.body.message).toBe('You have already registered a vehicle.');
    const read = await http().get('/driver/vehicle').set('Authorization', authorization).expect(200);
    expect(read.body).toEqual(first.body);
  });

  it('accepts only one of two registrations made at once', async () => {
    const { authorization } = await signedUpDriver(app);
    const register = () => http().post('/driver/vehicle').set('Authorization', authorization).send(choice);

    const statuses = (await Promise.all([register(), register()])).map((res) => res.status);

    expect(statuses.sort()).toEqual([201, 409]);
  });

  it.each([
    ['an unknown Vehicle Type', { ...choice, vehicleType: 'limo' }, 'Choose a Vehicle Type.'],
    ['a model of another Vehicle Type', { ...choice, model: 'Ford Galaxy' }, 'Choose a model from the list for this Vehicle Type.'],
    ['an unlisted colour', { ...choice, colour: 'Gold' }, 'Choose a colour from the list.'],
    ['no details', {}, 'Choose a Vehicle Type.'],
  ])('refuses %s', async (_, body, message) => {
    const { authorization } = await signedUpDriver(app);

    const res = await http().post('/driver/vehicle').set('Authorization', authorization).send(body).expect(400);

    expect(res.body.message).toBe(message);
  });

  it('needs a Driver session', async () => {
    const rider = await http().post('/rider/auth/signup').send({ email: newEmail(), password }).expect(201);

    await http().get('/driver/vehicle').expect(401);
    await http().post('/driver/vehicle').send(choice).expect(401);
    await http().post('/driver/vehicle').set('Authorization', `Bearer ${rider.body.token}`).send(choice).expect(401);
  });

  it('keeps each Driver’s vehicle to that Driver', async () => {
    const first = await signedUpDriver(app);
    const second = await signedUpDriver(app);
    await http().post('/driver/vehicle').set('Authorization', first.authorization).send(choice).expect(201);

    const res = await http().get('/driver/vehicle').set('Authorization', second.authorization).expect(200);

    expect(res.body).toEqual({ vehicle: null });
  });
});

describe('Simulated Driver approval', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  async function registered() {
    const clock = new ManualClock(start);
    const app = await createTestApp({ clock });
    const driver = await signedUpDriver(app);
    await request(app.getHttpServer()).post('/driver/vehicle').set('Authorization', driver.authorization).send(choice).expect(201);
    const status = async (on: INestApplication = app) => {
      const res = await request(on.getHttpServer()).get('/driver/vehicle').set('Authorization', driver.authorization).expect(200);
      return res.body.vehicle.status;
    };
    return { app, clock, status };
  }

  it('approves the application 10 seconds after it is made, on the simulation clock', async () => {
    const { app, clock, status } = await registered();
    try {
      clock.advance(9_999);
      expect(await status()).toBe('pending');

      clock.advance(1);
      expect(await status()).toBe('approved');
    } finally {
      await app.close();
    }
  });

  it('keeps the vehicle and its approval after the API is restarted', async () => {
    const { app, clock, status } = await registered();
    clock.advance(10_000);
    expect(await status()).toBe('approved');
    await app.close();

    const restarted = await createTestApp({ clock: new ManualClock(clock.now()) });
    try {
      expect(await status(restarted)).toBe('approved');
    } finally {
      await restarted.close();
    }
  });

  it('still approves an application that was pending when the API restarted', async () => {
    const { app, status } = await registered();
    await app.close();

    const restarted = await createTestApp({ clock: new ManualClock(new Date(start.getTime() + 10_000)) });
    try {
      expect(await status(restarted)).toBe('approved');
    } finally {
      await restarted.close();
    }
  });
});
