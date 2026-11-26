import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { SandboxResponse } from '@thirrem/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { FARE_RATES } from '../src/fares/fare-rates.js';
import { RidePaymentRepository } from '../src/payments/ride-payment.repository.js';
import { SandboxRepository } from '../src/sandbox/sandbox.repository.js';
import { createTestApp, ManualClock } from './support/app.js';
import { ownDatabase } from './support/database.js';
import { FakePaymentService } from './support/fake-payments.js';
import { StraightRoutingService } from './support/fake-routing.js';
import { FixedAreaRepository } from './support/fixed-area.js';
import { InstantPacer } from './support/pacers.js';

const password = 'Correct-horse-battery';
const pickup = { lat: 42.3803, lon: 20.4308 };
const north = (metres: number) => ({ ...pickup, lat: pickup.lat + metres / 111_195 });
const WINDOW_MS = 9_000;
const ACCEPT_MS = 2_000;
const BOARDING_MS = 15_000;
/** The only Driver starts 100 m from the Pickup Point, which is 10 s of driving at 10 m/s. */
const PICKUP_MS = ACCEPT_MS + 10_000 + BOARDING_MS;
/** The Drop-off Point is 2 km from the Pickup Point. */
const RIDE_MS = 200_000;
const { baseCents, perKmCents, perMinCents } = FARE_RATES.vehicleTypes.economy;
/** The Fare of 2 km driven in 200 s of Economy. */
const QUOTED_CENTS = Math.round(baseCents + perKmCents * 2 + (perMinCents * 200) / 60);

describe('Paying for a Ride', () => {
  let databaseUrl: string;
  let payments: FakePaymentService;
  let routing: StraightRoutingService;
  let clock: ManualClock;
  const apps: INestApplication[] = [];

  beforeAll(async () => {
    databaseUrl = await ownDatabase('thirrem_ride_payments');
  });
  beforeEach(() => {
    payments = new FakePaymentService();
    routing = new StraightRoutingService();
    clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(async () => {
    await database().query('DELETE FROM ride_payments');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const database = () => apps[0]!.get(DatabaseService);

  /** `settleMs` is how often the API looks for payments due, in real time. By default it never does while a test runs. */
  async function startApp({ settleMs = 3_600_000 } = {}) {
    const station = { vehicleType: 'economy' as const, heading: 90, ...north(100) };
    const app = await createTestApp({
      clock,
      routing,
      payments,
      pacer: new InstantPacer(),
      areas: new FixedAreaRepository({ centre: pickup, stations: [station], paths: [] }),
      config: { databaseUrl, settleMs, dispatch: { acceptWindowMs: WINDOW_MS, acceptAfterMs: { min: ACCEPT_MS, max: ACCEPT_MS }, boardingMs: BOARDING_MS, stopMs: 5_000 } },
    });
    apps.push(app);
    return app;
  }

  /** Lets the routes be found, in real time as the API's timer takes turns with them. */
  const searched = () => new Promise((resolve) => setTimeout(resolve, 60));

  /** The payments as the database keeps them, oldest first. */
  const kept = async () => (await database().query('SELECT * FROM ride_payments ORDER BY requested_at')).rows;

  /** A signed-up Rider with a running Sandbox, and a saved card unless told otherwise. */
  async function newRider({ card = true, app = undefined as INestApplication | undefined } = {}) {
    const server = (app ?? (await startApp())).getHttpServer();
    const { body: session } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password }).expect(201);
    const auth = { Authorization: `Bearer ${session.token}` };
    const open = async (body: object = {}): Promise<SandboxResponse> => (await request(server).put('/rider/sandbox').set(auth).send({ centre: pickup, ...body }).expect(200)).body;
    const addCard = async () => (await request(server).post('/rider/payment-methods/test-card').set(auth).expect(201)).body.methods;
    if (card) await addCard();
    await open();
    const ask = async (body: object = {}) => {
      const res = await request(server)
        .post('/rider/ride-requests')
        .set(auth)
        .send({ pickup, dropoff: north(-2_000), vehicleType: 'economy', pickupName: 'Sheshi Çarshia', dropoffName: 'Rruga Nëna Terezë', ...body });
      await searched();
      return res;
    };
    const after = (ms: number) => {
      clock.advance(ms);
      return open();
    };
    const send = async (method: 'post' | 'delete' | 'put', path: string, body?: object) => {
      const res = await request(server)[method](path).set(auth).send(body);
      await searched();
      return res;
    };
    return { server, auth, open, after, ask, addCard, send };
  }

  describe('making a Ride Request', () => {
    it('asks a Rider with no saved method to add one, and searches for nobody', async () => {
      const rider = await newRider({ card: false });

      const res = await rider.ask();

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ code: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method before requesting a Ride.' });
      expect((await rider.open()).rideRequest).toBeNull();
      expect(payments.holds).toEqual([]);
    });

    it('holds the quoted Fare on the default method', async () => {
      const rider = await newRider();
      const { body } = await request(rider.server).post('/rider/payment-methods/setup').set(rider.auth).expect(201);
      const setupId = payments.completeSetup(body.clientSecret, { brand: 'mastercard', last4: '4444', wallet: null });
      const saved = await rider.send('post', '/rider/payment-methods', { setupId });
      const mastercard = saved.body.methods.find((method: { last4: string }) => method.last4 === '4444');
      await rider.send('put', `/rider/payment-methods/${mastercard.id}/default`);

      expect((await rider.ask()).status).toBe(201);

      expect(payments.holds).toMatchObject([{ methodRef: payments.cardRef('4444'), amountCents: QUOTED_CENTS, status: 'held' }]);
    });

    it('keeps the open hold, with the names of the points and no coordinates', async () => {
      const rider = await newRider();

      const { body } = await rider.ask();

      expect(await kept()).toEqual([
        {
          id: expect.any(String),
          account_id: expect.any(String),
          ride_request_id: body.id,
          stripe_intent_ref: payments.holds[0]!.ref,
          status: 'held',
          vehicle_type: 'economy',
          pickup_name: 'Sheshi Çarshia',
          dropoff_name: 'Rruga Nëna Terezë',
          distance_m: expect.closeTo(2_000, 0),
          duration_s: expect.closeTo(200, 0),
          held_cents: QUOTED_CENTS,
          charge_cents: null,
          requested_at: new Date('2026-01-01T00:00:00Z'),
          settled_at: null,
          retried_at: null,
          card_brand: 'visa',
          card_last4: '4242',
          card_wallet: null,
          base_cents: null,
          distance_cents: null,
          time_cents: null,
          long_distance_cents: null,
        },
      ]);
    });

    it('refuses the Ride Request when the card is declined, until the method is fixed or changed', async () => {
      const rider = await newRider();
      payments.holdOutcome = 'declined';

      const refused = await rider.ask();

      expect(refused.status).toBe(402);
      expect(refused.body).toEqual({ code: 'PAYMENT_DECLINED', message: 'Your card was declined. Change your payment method, then try again.' });
      expect((await rider.open()).rideRequest).toBeNull();
      expect(await kept()).toMatchObject([{ status: 'declined', ride_request_id: null }]);

      payments.holdOutcome = 'held';
      expect((await rider.ask()).status).toBe(201);
    });

    it('searches for nobody while the payment service cannot be had', async () => {
      const rider = await newRider();
      payments.failing = true;

      const res = await rider.ask();

      expect(res.status).toBe(503);
      expect((await rider.open()).rideRequest).toBeNull();
    });

    it.each([
      ['down', 503],
      ['no route', 422],
    ] as const)('holds nothing when the route cannot be priced because routing is %s', async (outcome, status) => {
      const rider = await newRider();
      routing.outcome = outcome;

      const res = await rider.ask();

      expect(res.status).toBe(status);
      expect(payments.holds).toEqual([]);
    });

    it('holds nothing for a Ride Request that would be refused anyway', async () => {
      const rider = await newRider();
      await rider.ask();

      const res = await rider.ask();

      expect(res.status).toBe(409);
      expect(payments.holds).toHaveLength(1);
    });

    it('keeps a pin with no name as a pin on the map', async () => {
      const rider = await newRider();

      await rider.ask({ pickupName: undefined, dropoffName: '   ' });

      expect(await kept()).toMatchObject([{ pickup_name: 'Pin on the map', dropoff_name: 'Pin on the map' }]);
    });
  });

  describe('extra bank verification', () => {
    const FAILED = { code: 'PAYMENT_DECLINED', message: 'Your bank did not verify the payment, so nothing was held. Try again, or change your payment method.' };

    /** A Rider whose Ride Request is waiting on their bank, which the app now takes them to. */
    async function asked(app?: INestApplication) {
      const rider = await newRider({ app });
      payments.holdOutcome = 'verification';
      const res = await rider.ask();
      payments.holdOutcome = 'held';
      return { rider, res, holdId: res.body.holdId as string, clientSecret: res.body.clientSecret as string };
    }

    it('asks the app to verify the Rider, and searches for nobody meanwhile', async () => {
      const { rider, res } = await asked();

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ code: 'PAYMENT_VERIFICATION', message: 'Your bank needs to verify this payment.', holdId: expect.any(String), clientSecret: `${payments.holds[0]!.ref}_secret_fake`, publishableKey: 'pk_test_fake' });
      expect((await rider.open()).rideRequest).toBeNull();
      expect(await kept()).toMatchObject([{ status: 'pending', ride_request_id: null }]);
    });

    it('searches for a Driver once the Rider has passed it, on the one hold', async () => {
      const { rider, holdId, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);

      const res = await rider.ask({ holdId });

      expect(res.status).toBe(201);
      expect(payments.holds).toMatchObject([{ status: 'held' }]);
      expect(await kept()).toMatchObject([{ status: 'held', ride_request_id: res.body.id }]);
    });

    it.each([
      ['failed', false],
      ['left unfinished', null],
    ])('counts one that %s as a failed hold', async (_, passed) => {
      const { rider, holdId, clientSecret } = await asked();
      if (passed !== null) payments.finishVerification(clientSecret, passed);

      const res = await rider.ask({ holdId });

      expect(res.status).toBe(402);
      expect(res.body).toEqual(FAILED);
      expect((await rider.open()).rideRequest).toBeNull();
      expect(await kept()).toMatchObject([{ status: 'released' }]);
      expect(payments.holds).toMatchObject([{ status: 'released' }]);
    });

    it('releases one the Rider never comes back to', async () => {
      await asked(await startApp({ settleMs: 5 }));

      await passes(10 * 60_000);

      await becomes('released');
    });

    it('does not let another Rider use the hold', async () => {
      const { holdId, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);
      const other = await newRider({ app: apps[0] });

      const res = await other.ask({ holdId });

      expect(res.status).toBe(402);
      expect(await kept()).toMatchObject([{ status: 'pending' }]);
    });

    it.each([randomUUID(), 'not-an-id', 12])('refuses a hold it does not know: %s', async (holdId) => {
      const rider = await newRider();

      const res = await rider.ask({ holdId });

      expect(res.status).toBe(402);
      expect(payments.holds).toEqual([]);
    });

    it('does not take a hold for one Fare as the hold for another', async () => {
      const { rider, holdId, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);

      const res = await rider.ask({ holdId, vehicleType: 'xl' });

      expect(res.status).toBe(402);
      expect(await kept()).toMatchObject([{ status: 'released' }]);
    });

    it('does not use one hold for a second Ride', async () => {
      const { rider, holdId, clientSecret } = await asked();
      payments.finishVerification(clientSecret, true);
      await rider.ask({ holdId });
      await rider.after(PICKUP_MS + RIDE_MS);

      const res = await rider.ask({ holdId });

      expect(res.status).toBe(402);
    });
  });

  it('releases the second hold when the Rider asks twice at once', async () => {
    const rider = await newRider();
    let answer!: () => void;
    // Both are kept waiting for their quote until both have been let past the first check.
    routing.held = new Promise<void>((resolve) => (answer = resolve));
    const asking = [rider.ask(), rider.ask()];
    await vi.waitFor(() => expect(routing.requests).toHaveLength(2));
    routing.held = null;
    answer();

    const answers = await Promise.all(asking);

    expect(answers.map((res) => res.status).sort()).toEqual([201, 409]);
    await vi.waitFor(async () => expect((await kept()).map((payment) => payment.status).sort()).toEqual(['held', 'released']));
  });

  /** Time passing with the app closed, long enough for the API's timer to have looked. */
  const passes = async (ms: number) => {
    clock.advance(ms);
    await searched();
  };

  /** A Rider who has requested a Ride from an app whose API looks for payments due on its own. */
  async function requested(options: { settleMs?: number } = { settleMs: 5 }) {
    const rider = await newRider({ app: await startApp(options) });
    expect((await rider.ask()).status).toBe(201);
    return rider;
  }

  /** The one payment, once the API has made it `status`. */
  const becomes = (status: string) =>
    vi.waitFor(async () => {
      const [payment] = await kept();
      expect(payment).toMatchObject({ status });
      return payment;
    });

  const charged = (cents = QUOTED_CENTS) => [{ status: 'charged', chargedCents: cents }];

  it('asks for no card and holds nothing where payments are not set up', async () => {
    const app = await createTestApp({ clock, routing, config: { databaseUrl } });
    apps.push(app);
    const server = app.getHttpServer();
    const { body } = await request(server).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password }).expect(201);
    const auth = { Authorization: `Bearer ${body.token}` };
    await request(server).put('/rider/sandbox').set(auth).send({ centre: pickup }).expect(200);

    await request(server).post('/rider/ride-requests').set(auth).send({ pickup, dropoff: north(-2_000), vehicleType: 'economy' }).expect(201);

    expect(await kept()).toEqual([]);
  });

  describe('charging when the Ride ends', () => {
    it('charges a completed Ride, with the app closed', async () => {
      await requested();

      await passes(PICKUP_MS + RIDE_MS);

      expect(await becomes('charged')).toMatchObject({ charge_cents: QUOTED_CENTS, held_cents: QUOTED_CENTS, settled_at: clock.now() });
      expect(payments.holds).toMatchObject(charged());
    });

    it('charges nothing while the Ride is still going', async () => {
      await requested();

      await passes(PICKUP_MS + RIDE_MS - 1);

      expect(await kept()).toMatchObject([{ status: 'held' }]);
      expect(payments.holds).toMatchObject([{ status: 'held' }]);
    });

    it('charges as the app next asks, as a backup', async () => {
      const rider = await requested({});

      await rider.after(PICKUP_MS + RIDE_MS);

      expect(payments.holds).toMatchObject(charged());
      expect(await kept()).toMatchObject([{ status: 'charged' }]);
    });

    it('never charges above the quoted Fare', async () => {
      // The road driven turns out longer than the one quoted.
      routing.afterFirst(() => (routing.via = [north(1_000), { ...north(0), lon: pickup.lon + 0.008 }]));
      await requested();

      await passes(850_000);

      expect(await becomes('charged')).toMatchObject({ charge_cents: QUOTED_CENTS });
      expect(payments.holds).toMatchObject(charged());
    });

    it('charges a Ride ended early its shorter final Fare, and releases the rest', async () => {
      const rider = await requested();
      await rider.after(PICKUP_MS + 40_000);
      expect((await rider.send('post', '/rider/rides/end')).status).toBe(204);

      await passes(5_000);

      // 450 m in 45 s of Economy.
      const finalCents = Math.round(baseCents + perKmCents * 0.45 + perMinCents * 0.75);
      expect(await becomes('charged')).toMatchObject({ held_cents: QUOTED_CENTS, charge_cents: finalCents, distance_m: expect.closeTo(450, 0), duration_s: expect.closeTo(45, 3) });
      expect(payments.holds).toMatchObject(charged(finalCents));
    });

    it('charges a hold already placed after its method is changed or removed', async () => {
      const rider = await requested();
      const { body } = await request(rider.server).get('/rider/payment-methods').set(rider.auth).expect(200);
      expect((await rider.send('delete', `/rider/payment-methods/${body.methods[0].id}`)).status).toBe(200);

      await passes(PICKUP_MS + RIDE_MS);

      await becomes('charged');
      expect(payments.holds).toMatchObject(charged());
    });

    it('charges a completed Ride that another Ride Request takes the place of, before the API has looked', async () => {
      const rider = await requested({});
      clock.advance(PICKUP_MS + RIDE_MS);

      expect((await rider.ask()).status).toBe(201);

      await vi.waitFor(async () => expect(await kept()).toMatchObject([{ status: 'charged' }, { status: 'held' }]));
    });

    it('charges a completed Ride whose Sandbox is replaced before the API has looked', async () => {
      const rider = await requested({});
      clock.advance(PICKUP_MS + RIDE_MS);

      await rider.open({ fresh: true });

      expect(await kept()).toMatchObject([{ status: 'charged' }]);
    });

    it('tries a charge again until the payment service can be had', async () => {
      await requested();
      payments.failing = true;
      await passes(PICKUP_MS + RIDE_MS);
      expect(await kept()).toMatchObject([{ status: 'charging', charge_cents: QUOTED_CENTS }]);

      payments.failing = false;
      await passes(30_000);

      await becomes('charged');
    });

    it('leaves the Fare unpaid when its hold can no longer be charged', async () => {
      await requested();
      payments.holds[0]!.status = 'released';

      await passes(PICKUP_MS + RIDE_MS);

      expect(await becomes('unpaid')).toMatchObject({ charge_cents: QUOTED_CENTS });
    });
  });

  describe('releasing the whole hold', () => {
    const released = async () => {
      expect(await becomes('released')).toMatchObject({ charge_cents: null });
      expect(payments.holds).toMatchObject([{ status: 'released' }]);
    };

    it('releases it as the Ride Request is cancelled', async () => {
      const rider = await requested({});

      expect((await rider.send('delete', '/rider/ride-requests')).status).toBe(204);

      await released();
    });

    it('releases it when no Driver is found', async () => {
      const rider = await newRider({ app: await startApp({ settleMs: 5 }) });
      expect((await rider.ask({ vehicleType: 'comfort' })).status).toBe(201);

      await passes(7 * WINDOW_MS);

      await released();
    });

    it.each([
      ['while searching', 0],
      ['on the Ride', PICKUP_MS + 40_000],
    ])('releases it when the Sandbox is replaced %s', async (_, afterMs) => {
      const rider = await requested({});
      await rider.after(afterMs);

      await rider.open({ fresh: true });

      await released();
    });

    it('releases it when the Sandbox is discarded', async () => {
      routing.metresPerSecond = 0.05;
      await requested();

      // The Sandbox stops before the Driver can arrive, and is discarded a day later.
      await passes(25 * 60 * 60_000);
      await passes(0);

      await released();
    });
  });

  describe('when no route is to be had', () => {
    /** Finds the quoted route, then loses the one asked for in `lost`th place after it until repaired. */
    const losing = (lost: 1 | 2) => {
      const broken = new (class extends StraightRoutingService {
        repaired = false;
        override async route(...points: Parameters<StraightRoutingService['route']>) {
          this.outcome = this.requests.length === lost && !this.repaired ? 'no route' : 'route';
          return super.route(...points);
        }
      })();
      routing = broken;
      return broken;
    };

    const CASES = [
      { to: 'the Pickup Point', lost: 1, retry: '/rider/ride-requests/approach', waitMs: ACCEPT_MS },
      { to: 'the Drop-off Point', lost: 2, retry: '/rider/rides/route', waitMs: PICKUP_MS },
    ] as const;

    describe.each(CASES)('to $to', ({ lost, retry, waitMs }) => {
      /** A Rider whose Ride has got as far as it can, and whose hold the API has released by itself. */
      async function stuck() {
        const roads = losing(lost);
        const rider = await requested();
        await rider.after(waitMs);
        await becomes('released');
        const repair = () => (roads.repaired = true);
        const lookAgain = (body?: object) => rider.send('post', retry, body);
        return { rider, roads, repair, lookAgain };
      }

      it('releases the whole hold as the search gives up', async () => {
        await stuck();

        expect(payments.holds).toMatchObject([{ status: 'released' }]);
      });

      it('holds the Fare again before looking again, and charges it as the Ride completes', async () => {
        const { repair, lookAgain } = await stuck();
        repair();

        expect((await lookAgain()).status).toBe(204);

        expect((await kept()).map((payment) => payment.status)).toEqual(['released', 'held']);
        await passes(PICKUP_MS + RIDE_MS);
        await vi.waitFor(async () => expect((await kept())[1]).toMatchObject({ status: 'charged', charge_cents: QUOTED_CENTS, pickup_name: 'Sheshi Çarshia' }));
      });

      it('does not look again while the card is declined', async () => {
        const { roads, lookAgain } = await stuck();
        const asked = roads.requests.length;
        payments.holdOutcome = 'declined';

        const res = await lookAgain();

        expect(res.body.code).toBe('PAYMENT_DECLINED');
        expect(roads.requests).toHaveLength(asked);
      });

      it('looks again once the bank has verified the new hold', async () => {
        const { repair, lookAgain } = await stuck();
        repair();
        payments.holdOutcome = 'verification';
        const { body } = await lookAgain();
        expect(body.code).toBe('PAYMENT_VERIFICATION');
        payments.finishVerification(body.clientSecret, true);

        expect((await lookAgain({ holdId: body.holdId })).status).toBe(204);

        expect((await kept()).map((payment) => payment.status)).toEqual(['released', 'held']);
        expect(payments.holds).toHaveLength(2);
      });
    });

    it('never holds the Fare twice when the Rider looks again before the API has looked', async () => {
      losing(1);
      const rider = await requested({});
      clock.advance(ACCEPT_MS);

      expect((await rider.send('post', '/rider/ride-requests/approach')).status).toBe(204);

      expect(payments.holds.map((hold) => hold.status)).toEqual(['released', 'held']);
    });

    it('holds nothing more when there is a route already', async () => {
      const rider = await requested({});
      await rider.after(ACCEPT_MS);

      expect((await rider.send('post', '/rider/ride-requests/approach')).status).toBe(204);

      expect(payments.holds).toHaveLength(1);
    });
  });

  describe('a stopped Sandbox', () => {
    it('keeps its hold, and is charged once the Ride has completed after it resumes', async () => {
      routing.metresPerSecond = 1;
      const rider = await requested();
      await rider.after(ACCEPT_MS + 100_000 + BOARDING_MS + 40_000);

      await passes(3 * 60 * 60_000);
      expect(await kept()).toMatchObject([{ status: 'held' }]);

      await rider.open();
      await rider.after(600_000);
      await passes(600_000);
      await becomes('charged');
    });

    it('is charged for a Ride that completed before it stopped, however late the API looks', async () => {
      await requested();

      await passes(60 * 60_000);

      await becomes('charged');
    });
  });

  it('still counts what the Rider does while the API is looking at their payments', async () => {
    const rider = await requested();
    const repository = apps[0]!.get(RidePaymentRepository);
    const findOpen = repository.findOpen.bind(repository);
    let finish!: () => void;
    const slow = new Promise<void>((resolve) => (finish = resolve));
    const spy = vi.spyOn(repository, 'findOpen').mockImplementation(async (accountId) => {
      await slow;
      return findOpen(accountId);
    });
    clock.advance(10 * 60_000);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());

    const activity = rider.send('post', '/rider/fare', { pickup, dropoff: north(-2_000) });
    await searched();
    finish();
    expect((await activity).status).toBe(200);

    const [payment] = await kept();
    expect((await apps[0]!.get(SandboxRepository).findByAccount(payment.account_id))?.lastActiveMs).toBe(clock.now().getTime());
  });

  describe('an API restart', () => {
    it('keeps open holds and payments, and releases those of the Sandboxes it lost', async () => {
      const finished = await requested({});
      await finished.after(PICKUP_MS + RIDE_MS);
      const riding = await newRider({ app: apps[0] });
      await riding.ask();
      const before = await kept();
      expect(before).toMatchObject([{ status: 'charged' }, { status: 'held' }]);
      await apps.splice(0, 1)[0]!.close();

      await startApp({ settleMs: 5 });

      await vi.waitFor(async () => expect(await kept()).toEqual([before[0], { ...before[1], status: 'released', settled_at: clock.now() }]));
      expect(payments.holds).toMatchObject([{ status: 'charged' }, { status: 'released' }]);
    });
  });
});
