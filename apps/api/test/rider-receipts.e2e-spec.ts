import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Receipt } from '@thirrem/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { RidePaymentRepository } from '../src/payments/ride-payment.repository.js';
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
/** The Fare of 2 km driven in 200 s of Economy. */
const FARE_CENTS = 199;
const BREAKDOWN = { baseCents: 150, distanceCents: 26, timeCents: 23, longDistanceCents: 0 };

const partsOf = ({ breakdown, adjustmentCents }: Receipt) => Object.values(breakdown).reduce((sum, cents) => sum + cents, adjustmentCents);

describe('A receipt', () => {
  let databaseUrl: string;
  let payments: FakePaymentService;
  let routing: StraightRoutingService;
  let clock: ManualClock;
  const apps: INestApplication[] = [];

  beforeAll(async () => {
    databaseUrl = await ownDatabase('thirrem_receipts');
  });
  beforeEach(() => {
    payments = new FakePaymentService();
    routing = new StraightRoutingService();
    clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(async () => {
    await apps[0]!.get(DatabaseService).query('DELETE FROM ride_payments');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** The API never looks for payments due by itself, so a receipt has to be there as soon as it is asked for. */
  async function startApp() {
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(100) };
    const app = await createTestApp({
      clock,
      payments,
      routing,
      pacer: new InstantPacer(),
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { databaseUrl, dispatch: { acceptWindowMs: 9_000, acceptAfterMs: { min: ACCEPT_MS, max: ACCEPT_MS }, boardingMs: BOARDING_MS, stopMs: 5_000 } },
    });
    apps.push(app);
    return app;
  }

  /** Lets the routes be found. */
  const searched = () => new Promise((resolve) => setTimeout(resolve, 60));

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
    const send = async (method: 'get' | 'post' | 'delete' | 'put', path: string, body?: object) => {
      const res = await request(server)[method](path).set(auth).send(body);
      await searched();
      return res;
    };
    const open = (body: object = {}) => send('put', '/rider/sandbox', { centre: pickup, ...body });
    const ask = async () => {
      const res = await send('post', '/rider/ride-requests', { pickup, dropoff: north(-2_000), vehicleType: 'economy', pickupName: 'Sheshi Çarshia', dropoffName: 'Rruga Nëna Terezë' });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const receipts = async (): Promise<Receipt[]> => (await send('get', '/rider/receipts')).body.receipts;
    /** Saves a second card, which is not made the default. */
    const addMastercard = async () => {
      const { body } = await send('post', '/rider/payment-methods/setup');
      const setupId = payments.completeSetup(body.clientSecret, { brand: 'mastercard', last4: '4444', wallet: 'google_pay' });
      const saved = await send('post', '/rider/payment-methods', { setupId });
      return saved.body.methods.find((method: { last4: string }) => method.last4 === '4444').id as string;
    };
    return { token, send, open, ask, receipts, addMastercard };
  }

  /** A Rider whose completed Ride has been paid for. */
  async function ridden(app?: INestApplication) {
    const rider = await newRider(app);
    const rideId = await rider.ask();
    clock.advance(PICKUP_MS + RIDE_MS);
    return { ...rider, rideId };
  }

  it('is there as soon as a Ride has ended, with what was paid and how', async () => {
    const rider = await ridden();

    expect(await rider.receipts()).toEqual([
      {
        id: expect.any(String),
        rideId: rider.rideId,
        amountCents: FARE_CENTS,
        currency: 'EUR',
        requestedAt: '2026-01-01T00:00:00.000Z',
        vehicleType: 'economy',
        pickupName: 'Sheshi Çarshia',
        dropoffName: 'Rruga Nëna Terezë',
        distanceM: expect.closeTo(2_000, 0),
        durationS: expect.closeTo(200, 0),
        breakdown: BREAKDOWN,
        adjustmentCents: 0,
        paymentMethod: { brand: 'visa', last4: '4242', wallet: null },
      },
    ]);
  });

  it('is opened by its id', async () => {
    const rider = await ridden();
    const [receipt] = await rider.receipts();

    const res = await rider.send('get', `/rider/receipts/${receipt!.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(receipt);
  });

  it('is for the shorter Ride when it was ended early', async () => {
    const rider = await newRider();
    await rider.ask();
    clock.advance(PICKUP_MS + 40_000);
    expect((await rider.send('post', '/rider/rides/end')).status).toBe(204);
    clock.advance(5_000);

    const [receipt] = await rider.receipts();

    // 450 m in 45 s of Economy.
    expect(receipt).toMatchObject({ amountCents: 161, distanceM: expect.closeTo(450, 0), durationS: expect.closeTo(45, 0), breakdown: { baseCents: 150, distanceCents: 6, timeCents: 5, longDistanceCents: 0 }, adjustmentCents: 0 });
  });

  it('still adds up to the total when the charge was limited to the quoted Fare', async () => {
    // The Ride takes twice as long as it was quoted to.
    routing.afterFirst(() => (routing.metresPerSecond = 5));
    const rider = await newRider();
    await rider.ask();
    clock.advance(850_000);

    const [receipt] = await rider.receipts();

    expect(receipt!.amountCents).toBe(FARE_CENTS);
    expect(receipt!.adjustmentCents).toBeLessThan(0);
    expect(partsOf(receipt!)).toBe(FARE_CENTS);
  });

  it('is listed newest first', async () => {
    const rider = await ridden();
    await rider.open({ fresh: true });
    clock.advance(1_000);
    const second = await rider.ask();
    clock.advance(PICKUP_MS + RIDE_MS);

    expect((await rider.receipts()).map((receipt) => receipt.rideId)).toEqual([second, rider.rideId]);
  });

  describe('in a long list', () => {
    /** A Rider with `count` receipts, each Ride requested a minute after the one before, apart from the two oldest, requested at once. */
    async function paidOften(count: number, app?: INestApplication) {
      app ??= await startApp();
      const rider = await ridden(app);
      const [receipt] = await rider.receipts();
      const repository = app.get(RidePaymentRepository);
      const { rows } = await app.get(DatabaseService).query<{ account_id: string }>('SELECT account_id FROM ride_payments WHERE id = $1', [receipt!.id]);
      const paid = (await repository.find(rows[0]!.account_id, receipt!.id))!;
      for (let earlier = 1; earlier < count; earlier += 1) {
        const id = randomUUID();
        await repository.add({ ...paid, id, holdRef: null, requestedAtMs: paid.requestedAtMs - Math.min(earlier, count - 2) * 60_000 });
        await repository.update(id, { breakdown: paid.breakdown! }, 'charged');
      }
      const page = (after?: string) => rider.send('get', `/rider/receipts${after ? `?after=${after}` : ''}`);
      return { ...rider, newest: receipt!, page };
    }

    it('comes 6 at a time, newest first, saying how many there are in all', async () => {
      const rider = await paidOften(14);

      const first = (await rider.page()).body;
      const second = (await rider.page(first.next)).body;
      const third = (await rider.page(second.next)).body;

      expect([first, second, third].map((body) => [body.receipts.length, body.total])).toEqual([[6, 14], [6, 14], [2, 14]]);
      expect(third.next).toBeNull();
      const all: Receipt[] = [first, second, third].flatMap((body) => body.receipts);
      expect(new Set(all.map((receipt) => receipt.id)).size).toBe(14);
      expect(all[0]!.id).toBe(rider.newest.id);
      expect(all.map((receipt) => receipt.requestedAt)).toEqual(all.map((receipt) => receipt.requestedAt).sort().reverse());
    });

    it('has nothing more after exactly 6', async () => {
      const rider = await paidOften(6);

      expect((await rider.page()).body).toMatchObject({ total: 6, next: null });
    });

    it('splits Rides requested at once between pages without losing one', async () => {
      const rider = await paidOften(7);

      const first = (await rider.page()).body;
      const second = (await rider.page(first.next)).body;

      expect(second.receipts).toHaveLength(1);
      expect(first.receipts.map((receipt: Receipt) => receipt.id)).not.toContain(second.receipts[0].id);
    });

    it('does not carry on from a receipt of another Rider, or from one that is none', async () => {
      const app = await startApp();
      const rider = await paidOften(7, app);
      const { next } = (await rider.page()).body;
      const other = await newRider(app);

      expect((await other.send('get', `/rider/receipts?after=${next}`)).body).toEqual({ receipts: [], total: 0, next: null });
      expect((await rider.page('nonsense')).status).toBe(400);
    });
  });

  describe('is not given', () => {
    it('for a Ride still going', async () => {
      const rider = await newRider();
      await rider.ask();
      clock.advance(PICKUP_MS + RIDE_MS - 1);

      expect(await rider.receipts()).toEqual([]);
    });

    it('for a cancelled Ride Request', async () => {
      const rider = await newRider();
      await rider.ask();
      expect((await rider.send('delete', '/rider/ride-requests')).status).toBe(204);

      expect(await rider.receipts()).toEqual([]);
    });

    it('for a Fare still unpaid, whose id opens nothing', async () => {
      const rider = await newRider();
      await rider.ask();
      payments.holds.at(-1)!.status = 'released';
      clock.advance(PICKUP_MS + RIDE_MS);

      expect(await rider.receipts()).toEqual([]);
      const [unpaid] = (await rider.send('get', '/rider/unpaid-fares')).body.fares;
      expect((await rider.send('get', `/rider/receipts/${unpaid.id}`)).status).toBe(404);
    });

    it('for an id that is none', async () => {
      const rider = await newRider();

      for (const id of ['nonsense', randomUUID()]) expect((await rider.send('get', `/rider/receipts/${id}`)).status).toBe(404);
    });
  });

  describe('of an unpaid Fare paid later', () => {
    /** A Rider whose completed Ride could not be charged, with a second card to pay it on. */
    async function owing() {
      const rider = await newRider();
      const methodId = await rider.addMastercard();
      await rider.ask();
      payments.holds.at(-1)!.status = 'released';
      clock.advance(PICKUP_MS + RIDE_MS);
      const [fare] = (await rider.send('get', '/rider/unpaid-fares')).body.fares;
      const pay = (body: object) => rider.send('post', `/rider/unpaid-fares/${fare.id}/payment`, body);
      return { ...rider, methodId, pay };
    }

    const MASTERCARD = { brand: 'mastercard', last4: '4444', wallet: 'google_pay' };

    it('names the method that paid it', async () => {
      const rider = await owing();
      expect((await rider.pay({ methodId: rider.methodId })).status).toBe(200);

      expect(await rider.receipts()).toMatchObject([{ amountCents: FARE_CENTS, breakdown: BREAKDOWN, paymentMethod: MASTERCARD }]);
    });

    it('names the method the bank was asked to verify', async () => {
      const rider = await owing();
      payments.holdOutcome = 'verification';
      const { body } = await rider.pay({ methodId: rider.methodId });
      payments.finishVerification(body.clientSecret, true);
      expect((await rider.pay({ holdId: body.holdId })).status).toBe(200);

      expect(await rider.receipts()).toMatchObject([{ paymentMethod: MASTERCARD }]);
    });

    it('does not name a method whose bank check was given up on', async () => {
      const rider = await owing();
      payments.holdOutcome = 'verification';
      await rider.pay({ methodId: rider.methodId });
      payments.holdOutcome = 'held';
      expect((await rider.pay({})).status).toBe(200);

      expect(await rider.receipts()).toMatchObject([{ paymentMethod: { last4: '4242' } }]);
    });
  });

  it('keeps the method it was paid with after that method is removed', async () => {
    const rider = await ridden();
    await rider.receipts();
    const { body } = await rider.send('get', '/rider/payment-methods');
    expect((await rider.send('delete', `/rider/payment-methods/${body.methods[0].id}`)).status).toBe(200);

    expect(await rider.receipts()).toMatchObject([{ paymentMethod: { brand: 'visa', last4: '4242', wallet: null } }]);
  });

  it('survives an API restart and a new Sandbox', async () => {
    const before = await ridden();
    const receipts = await before.receipts();
    expect(receipts).toHaveLength(1);
    await apps.splice(0, 1)[0]!.close();

    const rider = riderOn((await startApp()).getHttpServer(), before.token);
    await rider.open({ fresh: true });

    expect(await rider.receipts()).toEqual(receipts);
    expect((await rider.send('get', `/rider/receipts/${receipts[0]!.id}`)).body).toEqual(receipts[0]);
  });

  it('is shown to its own Rider only', async () => {
    const app = await startApp();
    const rider = await ridden(app);
    const [receipt] = await rider.receipts();
    const other = await newRider(app);

    expect(await other.receipts()).toEqual([]);
    expect((await other.send('get', `/rider/receipts/${receipt!.id}`)).status).toBe(404);
  });

  it('needs the Rider to be logged in', async () => {
    const server = (await startApp()).getHttpServer();

    await request(server).get('/rider/receipts').expect(401);
    await request(server).get(`/rider/receipts/${randomUUID()}`).expect(401);
  });
});
