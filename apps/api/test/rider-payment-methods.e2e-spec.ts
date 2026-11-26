import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { UnavailablePaymentService } from '../src/payments/unavailable-payment.service.js';
import { createTestApp } from './support/app.js';
import { FakePaymentService, type NewCard } from './support/fake-payments.js';

const password = 'Correct-horse-battery';
const visa = { brand: 'visa', last4: '4242', wallet: null };
const mastercard = { brand: 'mastercard', last4: '4444', wallet: null };

describe('Rider saved payment methods', () => {
  let app: INestApplication;
  let payments: FakePaymentService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    payments = new FakePaymentService();
    app = await createTestApp({ payments });
  });
  afterAll(async () => {
    await app.close();
  });

  async function newRider() {
    const { body } = await http().post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password }).expect(201);
    const auth = { Authorization: `Bearer ${body.token}` };
    return {
      list: () => http().get('/rider/payment-methods').set(auth),
      startSetup: () => http().post('/rider/payment-methods/setup').set(auth),
      save: (body: object) => http().post('/rider/payment-methods').set(auth).send(body),
      addTestCard: () => http().post('/rider/payment-methods/test-card').set(auth),
      makeDefault: (id: string) => http().put(`/rider/payment-methods/${id}/default`).set(auth),
      remove: (id: string) => http().delete(`/rider/payment-methods/${id}`).set(auth),
    };
  }

  /** Adds a card the way the app does: the Rider fills in Stripe's form, then the app reports the finished setup. */
  async function addCard(rider: Awaited<ReturnType<typeof newRider>>, card: NewCard = visa) {
    const { body } = await rider.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, card);
    return rider.save({ setupId }).expect(201);
  }

  it('starts with no saved method, and says which key the app shows the card form with', async () => {
    const rider = await newRider();

    const res = await rider.list().expect(200);

    expect(res.body).toEqual({ publishableKey: 'pk_test_fake', methods: [] });
  });

  it('saves the brand and last four digits of a card the Rider added, as the default', async () => {
    const rider = await newRider();

    const res = await addCard(rider);

    expect(res.body.methods).toEqual([{ id: expect.any(String), ...visa, isDefault: true }]);
    expect((await rider.list().expect(200)).body).toEqual(res.body);
  });

  it.each(['apple_pay', 'google_pay'] as const)('saves a card added through %s like any other, and remembers the wallet', async (wallet) => {
    const rider = await newRider();

    const res = await addCard(rider, { ...visa, wallet });

    expect(res.body.methods).toEqual([{ id: expect.any(String), ...visa, wallet, isDefault: true }]);
  });

  it('does not save a card whose setup has not succeeded', async () => {
    const rider = await newRider();
    const { body } = await rider.startSetup().expect(201);

    const res = await rider.save({ setupId: payments.setupId(body.clientSecret) }).expect(400);

    expect(res.body.message).toMatch(/not saved/i);
    expect((await rider.list()).body.methods).toEqual([]);
  });

  it('does not let a Rider save a card another Rider set up', async () => {
    const owner = await newRider();
    const other = await newRider();
    await other.startSetup().expect(201);
    const { body } = await owner.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, visa);

    await other.save({ setupId }).expect(400);

    expect((await other.list()).body.methods).toEqual([]);
  });

  it('keeps one saved method when the same setup is reported twice', async () => {
    const rider = await newRider();
    const { body } = await rider.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, visa);

    await rider.save({ setupId }).expect(201);
    const again = await rider.save({ setupId }).expect(201);

    expect(again.body.methods).toHaveLength(1);
  });

  it('refuses a card that is already saved, and forgets the second copy at Stripe', async () => {
    const rider = await newRider();
    const first = await addCard(rider);
    const { body } = await rider.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, visa);

    const res = await rider.save({ setupId }).expect(409);

    expect(res.body.message).toBe('That card is already saved. To replace it, remove it first.');
    expect(payments.forgotten.at(-1)).toBe(payments.cardRef('4242'));
    expect((await rider.list()).body.methods).toEqual(first.body.methods);
  });

  it('does not save a refused second copy later, when its setup is reported again', async () => {
    const rider = await newRider();
    const first = await addCard(rider);
    const { body } = await rider.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, visa);
    await rider.save({ setupId }).expect(409);
    await rider.remove(first.body.methods[0].id).expect(200);

    await rider.save({ setupId }).expect(400);

    expect((await rider.list()).body.methods).toEqual([]);
  });

  it('refuses the test card a second time, and one typed in after the test card', async () => {
    const rider = await newRider();
    await rider.addTestCard().expect(201);

    await rider.addTestCard().expect(409);
    const { body } = await rider.startSetup().expect(201);
    await rider.save({ setupId: payments.completeSetup(body.clientSecret, visa) }).expect(409);

    expect((await rider.list()).body.methods).toHaveLength(1);
  });

  it('keeps one copy when the same card is added twice at once', async () => {
    const rider = await newRider();

    const answers = await Promise.all([rider.addTestCard(), rider.addTestCard()]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect((await rider.list()).body.methods).toHaveLength(1);
  });

  it('tells cards apart by more than their last four digits, and a wallet from the card typed in', async () => {
    const rider = await newRider();
    await addCard(rider);

    await addCard(rider, { ...visa, fingerprint: 'another-card' });
    const res = await addCard(rider, { ...visa, wallet: 'apple_pay' });

    expect(res.body.methods).toHaveLength(3);
  });

  it('lets a Rider add a card again once it is removed, and lets two Riders save the same card', async () => {
    const rider = await newRider();
    const other = await newRider();
    const { body } = await rider.addTestCard().expect(201);
    await other.addTestCard().expect(201);

    await rider.remove(body.methods[0].id).expect(200);

    await rider.addTestCard().expect(201);
  });

  it('keeps one Stripe customer for a Rider, however many cards are added', async () => {
    const rider = await newRider();
    const before = payments.customers.length;

    await Promise.all([rider.startSetup().expect(201), rider.startSetup().expect(201)]);
    await rider.addTestCard().expect(201);

    expect(new Set(payments.customers.slice(before)).size).toBe(1);
  });

  it('answers every one of a new Rider’s requests made at the same moment', async () => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const rider = await newRider();

      await Promise.all([rider.startSetup().expect(201), rider.startSetup().expect(201), rider.startSetup().expect(201)]);
    }
  });

  it('adds a Stripe test card in one request', async () => {
    const rider = await newRider();

    const res = await rider.addTestCard().expect(201);

    expect(res.body.methods).toEqual([{ id: expect.any(String), ...visa, isDefault: true }]);
  });

  it('keeps the first method as the default until the Rider chooses another', async () => {
    const rider = await newRider();
    await addCard(rider);
    const second = await addCard(rider, mastercard);
    expect(second.body.methods.map((method: { isDefault: boolean }) => method.isDefault)).toEqual([true, false]);

    const res = await rider.makeDefault(second.body.methods[1].id).expect(200);

    expect(res.body.methods.map((method: { isDefault: boolean }) => method.isDefault)).toEqual([false, true]);
  });

  it('removes a method here and at Stripe, and makes the newest one left the default', async () => {
    const rider = await newRider();
    await addCard(rider);
    await addCard(rider, mastercard);
    const { body } = await addCard(rider, { brand: 'amex', last4: '8431', wallet: null });
    const [first] = body.methods;

    const res = await rider.remove(first.id).expect(200);

    expect(res.body.methods).toMatchObject([
      { brand: 'mastercard', isDefault: false },
      { brand: 'amex', isDefault: true },
    ]);
    expect(payments.forgotten.at(-1)).toBe(payments.cardRef('4242'));
  });

  it('leaves the default alone when another method is removed', async () => {
    const rider = await newRider();
    await addCard(rider);
    const { body } = await addCard(rider, mastercard);

    const res = await rider.remove(body.methods[1].id).expect(200);

    expect(res.body.methods).toMatchObject([{ brand: 'visa', isDefault: true }]);
  });

  it('does not let a Rider change or remove another Rider’s method', async () => {
    const owner = await newRider();
    const other = await newRider();
    const { body } = await addCard(owner);
    const { id } = body.methods[0];

    await other.makeDefault(id).expect(404);
    await other.remove(id).expect(404);
    await other.remove('not-a-method').expect(404);
    await other.makeDefault(randomUUID()).expect(404);

    expect((await owner.list()).body.methods).toEqual(body.methods);
  });

  it('keeps saved methods when the API restarts', async () => {
    const email = `rider-${randomUUID()}@example.com`;
    const { body } = await http().post('/rider/auth/signup').send({ email, password }).expect(201);
    const auth = { Authorization: `Bearer ${body.token}` };
    const saved = await http().post('/rider/payment-methods/test-card').set(auth).expect(201);

    const restarted = await createTestApp({ payments: new FakePaymentService() });
    const res = await request(restarted.getHttpServer()).get('/rider/payment-methods').set(auth).expect(200);
    await restarted.close();

    expect(res.body.methods).toEqual(saved.body.methods);
  });

  it('keeps only Stripe references, brand, last four digits and the default, even when sent card details', async () => {
    const rider = await newRider();
    const { body } = await rider.startSetup().expect(201);
    const setupId = payments.completeSetup(body.clientSecret, visa);

    await rider.save({ setupId, number: '4242424242424242', cvc: 'security-code-987' }).expect(201);

    const database = app.get(DatabaseService);
    const columns = await database.query<{ column: string }>(
      `SELECT table_name || '.' || column_name AS column FROM information_schema.columns
       WHERE table_name IN ('payment_customers', 'payment_methods') ORDER BY 1`,
    );
    expect(columns.rows.map((row) => row.column)).toEqual([
      'payment_customers.account_id',
      'payment_customers.default_method_id',
      'payment_customers.stripe_customer_ref',
      'payment_methods.account_id',
      'payment_methods.brand',
      'payment_methods.created_order',
      'payment_methods.id',
      'payment_methods.last4',
      'payment_methods.stripe_method_ref',
      'payment_methods.wallet',
    ]);
    const stored = await database.query('SELECT * FROM payment_methods');
    expect(JSON.stringify(stored.rows)).not.toContain('4242424242424242');
    expect(JSON.stringify(stored.rows)).not.toContain('security-code-987');
  });

  it('says cards are unavailable when Stripe fails, and changes nothing', async () => {
    const rider = await newRider();
    const { body } = await rider.addTestCard().expect(201);
    payments.failing = true;

    const added = await rider.addTestCard().expect(503);
    await rider.startSetup().expect(503);
    await rider.remove(body.methods[0].id).expect(503);
    payments.failing = false;

    expect(added.body.message).toMatch(/try again/i);
    expect((await rider.list().expect(200)).body.methods).toEqual(body.methods);
  });

  it('refuses a request with no session token', async () => {
    await http().get('/rider/payment-methods').expect(401);
    await http().post('/rider/payment-methods/setup').expect(401);
    await http().post('/rider/payment-methods').send({ setupId: 'seti_1' }).expect(401);
    await http().post('/rider/payment-methods/test-card').expect(401);
    await http().put(`/rider/payment-methods/${randomUUID()}/default`).expect(401);
    await http().delete(`/rider/payment-methods/${randomUUID()}`).expect(401);
  });

  it('starts without Stripe keys, offering no card form and saying payments are not set up', async () => {
    const unset = await createTestApp({ payments: new UnavailablePaymentService() });
    const server = () => request(unset.getHttpServer());
    const { body } = await server().post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password }).expect(201);
    const auth = { Authorization: `Bearer ${body.token}` };

    const list = await server().get('/rider/payment-methods').set(auth).expect(200);
    const refused = await server().post('/rider/payment-methods/test-card').set(auth).expect(503);
    await unset.close();

    expect(list.body).toEqual({ publishableKey: null, methods: [] });
    expect(refused.body.message).toMatch(/not set up/i);
  });
});
