import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { FARE_RATES } from '../src/fares/fare-rates.js';
import { HoldLostError, PaymentServiceError } from '../src/payments/payment.service.js';
import { createTestApp, ManualClock } from './support/app.js';
import { ownDatabase } from './support/database.js';
import { FakePaymentService } from './support/fake-payments.js';
import { StraightRoutingService } from './support/fake-routing.js';
import { FixedAreaRepository } from './support/fixed-area.js';
import { InstantPacer } from './support/pacers.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...pickup, lat: pickup.lat + metres / 111_195 });
const ACCEPT_MS = 2_000;
const BOARDING_MS = 15_000;
/** The only Driver starts 100 m from the Pickup Point, which is 10 s of driving at 10 m/s. */
const PICKUP_MS = ACCEPT_MS + 10_000 + BOARDING_MS;
/** The Drop-off Point is 2 km from the Pickup Point. */
const RIDE_MS = 200_000;
const { baseCents, perKmCents, perMinCents } = FARE_RATES.vehicleTypes.economy;
/** The Fare of 2 km driven in 200 s of Economy. */
const FARE_CENTS = Math.round(baseCents + perKmCents * 2 + (perMinCents * 200) / 60);
const UNPAID = { code: 'FARE_UNPAID', message: 'Pay your unpaid Fare before requesting another Ride.' };

describe('An unpaid Fare', () => {
  let databaseUrl: string;
  let payments: FakePaymentService;
  let clock: ManualClock;
  const apps: INestApplication[] = [];

  beforeAll(async () => {
    databaseUrl = await ownDatabase('thirrem_unpaid_fares');
  });
  beforeEach(() => {
    payments = new FakePaymentService();
    clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(async () => {
    await apps[0]!.get(DatabaseService).query('DELETE FROM ride_payments');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const kept = async () => (await apps[0]!.get(DatabaseService).query('SELECT * FROM ride_payments ORDER BY requested_at')).rows;

  /** `settleMs` is how often the API looks for payments due, in real time. By default it never does while a test runs. */
  async function startApp({ settleMs = 3_600_000 } = {}) {
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(100) };
    const app = await createTestApp({
      clock,
      payments,
      routing: new StraightRoutingService(),
      pacer: new InstantPacer(),
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { databaseUrl, settleMs, dispatch: { acceptWindowMs: 9_000, acceptAfterMs: { min: ACCEPT_MS, max: ACCEPT_MS }, boardingMs: BOARDING_MS, stopMs: 5_000 } },
    });
    apps.push(app);
    return app;
  }

  /** Lets the routes be found, in real time as the API's timer takes turns with them. */
  const searched = () => new Promise((resolve) => setTimeout(resolve, 60));

  /** A signed-up Rider with a saved card and a running Sandbox, as `app` sees them. */
  async function newRider(app?: INestApplication) {
    const server = (app ?? (await startApp())).getHttpServer();
    const email = `rider-${randomUUID()}@example.com`;
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email, password }).expect(201);
    const rider = riderOn(server, session.token);
    await rider.send('post', '/rider/payment-methods/test-card');
    await rider.open();
    return rider;
  }

  function riderOn(server: Parameters<typeof request>[0], token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    const send = async (method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object) => {
      const res = await request(server)[method](path).set(auth).send(body);
      await searched();
      return res;
    };
    const open = (body: object = {}) => send('put', '/rider/sandbox', { centre: pickup, ...body });
    const ask = () => send('post', '/rider/ride-requests', { pickup, dropoff: north(-2_000), vehicleType: 'economy', pickupName: 'Sheshi Çarshia', dropoffName: 'Rruga Nëna Terezë' });
    const unpaid = async () => (await send('get', '/rider/unpaid-fares')).body.fares;
    /** Pays the oldest unpaid Fare. */
    const pay = async (body: object = {}) => send('post', `/rider/unpaid-fares/${(await unpaid())[0].id}/payment`, body);
    /** Saves a second card, which is not made the default. */
    const addMastercard = async () => {
      const { body } = await send('post', '/rider/payment-methods/setup');
      const setupId = payments.completeSetup(body.clientSecret, { brand: 'mastercard', last4: '4444', wallet: null });
      const saved = await send('post', '/rider/payment-methods', { setupId });
      return saved.body.methods.find((method: { last4: string }) => method.last4 === '4444').id as string;
    };
    return { token, send, open, ask, unpaid, pay, addMastercard };
  }

  /** A Rider whose completed Ride could not be charged, as its hold was gone by then. */
  async function owing(app?: INestApplication) {
    const rider = await newRider(app);
    expect((await rider.ask()).status).toBe(201);
    payments.holds.at(-1)!.status = 'released';
    clock.advance(PICKUP_MS + RIDE_MS);
    return rider;
  }

  it('is listed as soon as the Ride has ended, with what it was for', async () => {
    const rider = await owing();

    expect(await rider.unpaid()).toEqual([
      { id: expect.any(String), amountCents: FARE_CENTS, currency: 'EUR', vehicleType: 'economy', pickupName: 'Sheshi Çarshia', dropoffName: 'Rruga Nëna Terezë', requestedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('is not listed for a Fare that was charged', async () => {
    const rider = await newRider();
    await rider.ask();
    clock.advance(PICKUP_MS + RIDE_MS);

    expect(await rider.unpaid()).toEqual([]);
    expect(await kept()).toMatchObject([{ status: 'charged' }]);
  });

  it('refuses a new Ride Request, even the first one after the Ride has ended, and holds nothing', async () => {
    const rider = await owing();

    const res = await rider.ask();

    expect(res.status).toBe(402);
    expect(res.body).toEqual(UNPAID);
    expect(payments.holds).toHaveLength(1);
    expect((await rider.open()).body.rideRequest).toBeNull();
  });

  it('is shown to its own Rider only, and stops no other', async () => {
    const app = await startApp();
    await owing(app);
    await (await newRider(app)).unpaid();
    const other = await newRider(app);

    expect(await other.unpaid()).toEqual([]);
    expect((await other.ask()).status).toBe(201);
  });

  it('survives an API restart and a new Sandbox', async () => {
    const before = await owing();
    const [fare] = await before.unpaid();
    await apps.splice(0, 1)[0]!.close();

    const rider = riderOn((await startApp()).getHttpServer(), before.token);
    await rider.open({ fresh: true });

    expect(await rider.unpaid()).toEqual([fare]);
    expect((await rider.ask()).body).toEqual(UNPAID);
  });

  describe('paying it again', () => {
    it('charges the default method the amount due, and lets the Rider request a Ride', async () => {
      const rider = await owing();

      const res = await rider.pay();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ fares: [] });
      expect(payments.holds.at(-1)).toMatchObject({ methodRef: payments.cardRef('4242'), amountCents: FARE_CENTS, status: 'charged', chargedCents: FARE_CENTS });
      expect(await kept()).toMatchObject([{ status: 'charged', charge_cents: FARE_CENTS, stripe_intent_ref: payments.holds.at(-1)!.ref, settled_at: clock.now() }]);
      expect((await rider.ask()).status).toBe(201);
    });

    it('charges another method if the Rider chooses one', async () => {
      const rider = await owing();
      const methodId = await rider.addMastercard();

      expect((await rider.pay({ methodId })).status).toBe(200);

      expect(payments.holds.at(-1)).toMatchObject({ methodRef: payments.cardRef('4444'), status: 'charged' });
    });

    it('says why the card was declined, and leaves the Fare to be paid another way', async () => {
      const rider = await owing();
      payments.holdOutcome = 'declined';

      const res = await rider.pay();

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ code: 'PAYMENT_DECLINED', message: 'Your card was declined. Your Fare is still unpaid. Try again, or choose another method.' });
      expect(await rider.unpaid()).toHaveLength(1);

      payments.holdOutcome = 'held';
      expect((await rider.pay()).body).toEqual({ fares: [] });
    });

    it('leaves the Fare unpaid while the payment service cannot be had', async () => {
      const rider = await owing();
      const [fare] = await rider.unpaid();
      payments.failing = true;

      const res = await rider.send('post', `/rider/unpaid-fares/${fare.id}/payment`);

      expect(res.status).toBe(503);
      expect(res.body.message).toBe('Cards are unavailable right now, so your Fare was not paid. Try again in a moment.');
      expect(await rider.unpaid()).toEqual([fare]);
    });

    it('asks a Rider with no saved method to add one', async () => {
      const rider = await owing();
      const { body } = await rider.send('get', '/rider/payment-methods');
      await rider.send('delete', `/rider/payment-methods/${body.methods[0].id}`);

      const res = await rider.pay();

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ code: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method to pay your Fare.' });
    });

    it('does not fall back to the default when the chosen method has been removed', async () => {
      const rider = await owing();

      const res = await rider.pay({ methodId: randomUUID() });

      expect(res.status).toBe(404);
      expect(payments.holds).toHaveLength(1);
    });

    it('charges once when asked twice at once', async () => {
      const rider = await owing();
      const [fare] = await rider.unpaid();
      const pay = () => rider.send('post', `/rider/unpaid-fares/${fare.id}/payment`);

      const answers = await Promise.all([pay(), pay()]);

      expect(answers.map((res) => res.status)).toContain(200);
      expect(payments.holds.filter((hold) => hold.status === 'charged')).toHaveLength(1);
      expect(payments.holds).toHaveLength(2);
    });

    it('changes nothing for a Fare already paid', async () => {
      const rider = await owing();
      const [fare] = await rider.unpaid();
      await rider.pay();

      const res = await rider.send('post', `/rider/unpaid-fares/${fare.id}/payment`);

      expect(res.body).toEqual({ fares: [] });
      expect(payments.holds).toHaveLength(2);
    });

    it('keeps trying a charge the payment service did not answer, and counts the Fare as paid', async () => {
      const rider = await owing(await startApp({ settleMs: 5 }));
      await rider.unpaid();
      const capture = payments.captureHold.bind(payments);
      let answers = false;
      payments.captureHold = async (...args) => {
        if (!answers) throw new PaymentServiceError('Stripe is down');
        return capture(...args);
      };

      expect((await rider.pay()).body).toEqual({ fares: [] });
      expect(await kept()).toMatchObject([{ status: 'charging' }]);

      answers = true;
      clock.advance(30_000);
      await vi.waitFor(async () => expect(await kept()).toMatchObject([{ status: 'charged' }]));
    });

    it('says so when the new charge fails too', async () => {
      const rider = await owing();
      await rider.unpaid();
      payments.captureHold = async () => {
        throw new HoldLostError('The card was declined');
      };

      const res = await rider.pay();

      expect(res.status).toBe(402);
      expect(res.body.code).toBe('PAYMENT_DECLINED');
      expect(await rider.unpaid()).toHaveLength(1);
    });

    it('does not let another Rider pay or see it', async () => {
      const app = await startApp();
      const [fare] = await (await owing(app)).unpaid();
      const other = await newRider(app);

      const res = await other.send('post', `/rider/unpaid-fares/${fare.id}/payment`);

      expect(res.status).toBe(404);
      expect((await other.send('post', '/rider/unpaid-fares/not-an-id/payment')).status).toBe(404);
      expect(payments.holds).toHaveLength(1);
    });
  });

  describe('extra bank verification when paying it', () => {
    const FAILED = { code: 'PAYMENT_DECLINED', message: 'Your bank did not verify the payment. Your Fare is still unpaid. Try again, or choose another method.' };

    /** A Rider whose payment of their Fare is waiting on their bank. */
    async function asked(app?: INestApplication) {
      const rider = await owing(app);
      payments.holdOutcome = 'verification';
      const res = await rider.pay();
      payments.holdOutcome = 'held';
      const { holdId, clientSecret } = res.body as { holdId: string; clientSecret: string };
      return { rider, res, holdId, clientSecret };
    }

    /** Time passing with the app closed, long enough for the API's timer to have looked. */
    const passes = async (ms: number) => {
      clock.advance(ms);
      await searched();
    };

    it('asks the app to verify the Rider, and counts the Fare as unpaid meanwhile', async () => {
      const { rider, res } = await asked();

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ code: 'PAYMENT_VERIFICATION', message: 'Your bank needs to verify this payment.', holdId: expect.any(String), clientSecret: `${payments.holds.at(-1)!.ref}_secret_fake`, publishableKey: 'pk_test_fake' });
      expect(await rider.unpaid()).toHaveLength(1);
      expect((await rider.ask()).body).toEqual(UNPAID);
    });

    it('charges the one hold once the Rider has passed it', async () => {
      const { rider, holdId, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);

      const res = await rider.pay({ holdId });

      expect(res.body).toEqual({ fares: [] });
      expect(payments.holds).toHaveLength(2);
      expect(payments.holds[1]).toMatchObject({ status: 'charged', chargedCents: FARE_CENTS });
      expect((await rider.send('post', `/rider/unpaid-fares/${holdId}/payment`, { holdId })).status).toBe(200);
    });

    it.each([
      ['failed', false],
      ['left unfinished', null],
    ])('releases one that %s, and leaves the Fare unpaid', async (_, passed) => {
      const { rider, holdId, clientSecret } = await asked();
      if (passed !== null) payments.finishVerification(clientSecret, passed);

      const res = await rider.pay({ holdId });

      expect(res.status).toBe(402);
      expect(res.body).toEqual(FAILED);
      expect(payments.holds[1]).toMatchObject({ status: 'released' });
      expect(await kept()).toMatchObject([{ status: 'unpaid' }]);
    });

    it('takes no other hold as passed', async () => {
      const { rider, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);

      const res = await rider.pay({ holdId: randomUUID() });

      expect(res.body).toEqual(FAILED);
      expect(payments.holds.filter((hold) => hold.status === 'charged')).toEqual([]);
    });

    it('keeps the hold to be asked about again while the payment service cannot be had', async () => {
      const { rider, holdId, clientSecret } = await asked();
      await rider.unpaid();
      payments.finishVerification(clientSecret, true);
      payments.failing = true;

      expect((await rider.send('post', `/rider/unpaid-fares/${holdId}/payment`, { holdId })).status).toBe(503);

      payments.failing = false;
      expect((await rider.pay({ holdId })).body).toEqual({ fares: [] });
    });

    it('releases the waiting hold when the Rider starts over with another method', async () => {
      const { rider } = await asked();
      const methodId = await rider.addMastercard();

      expect((await rider.pay({ methodId })).body).toEqual({ fares: [] });

      expect(payments.holds.map((hold) => hold.status)).toEqual(['released', 'released', 'charged']);
    });

    it('releases one the Rider never comes back to, after 10 minutes', async () => {
      const { rider } = await asked(await startApp({ settleMs: 5 }));

      await passes(10 * 60_000 - 1);
      expect(payments.holds[1]).toMatchObject({ status: 'verification' });
      await passes(1);

      await vi.waitFor(async () => expect(await kept()).toMatchObject([{ status: 'unpaid' }]));
      expect(payments.holds[1]).toMatchObject({ status: 'released' });
      expect(await rider.unpaid()).toHaveLength(1);
    });

    it('releases one left waiting through an API restart', async () => {
      await asked();
      await apps.splice(0, 1)[0]!.close();
      clock.advance(10 * 60_000);

      await startApp({ settleMs: 5 });

      await vi.waitFor(async () => expect(await kept()).toMatchObject([{ status: 'unpaid' }]));
      expect(payments.holds[1]).toMatchObject({ status: 'released' });
    });
  });

  it('is not listed without a session', async () => {
    const app = await startApp();

    await request(app.getHttpServer()).get('/rider/unpaid-fares').expect(401);
  });
});
