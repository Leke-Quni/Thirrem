import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Trip } from '../fares/fare-calculator.js';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { PaymentMethodRepository } from './payment-method.repository.js';
import { isPaymentId, refused } from './payment-refusal.js';
import { HoldLostError, PaymentService, PaymentServiceError, type PlacedHold } from './payment.service.js';
import { type QuotedRide, type RidePayment, RidePaymentRepository } from './ride-payment.repository.js';

/** How long a Rider has to pass their bank's check before the hold waiting on it is released. */
export const VERIFY_WITHIN_MS = 10 * 60_000;

/** How long a charge or release that failed waits before it is tried again. */
const RETRY_AFTER_MS = 30_000;

const fareUnpaid = () => refused({ code: 'FARE_UNPAID', message: 'Pay your unpaid Fare before requesting another Ride.' });

const noMethod = () => refused({ code: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method before requesting a Ride.' });

const declined = (reason: string) => refused({ code: 'PAYMENT_DECLINED', message: `${reason} Change your payment method, then try again.` });

const unverified = () => refused({ code: 'PAYMENT_DECLINED', message: 'Your bank did not verify the payment, so nothing was held. Try again, or change your payment method.' });

const unavailable = (error: unknown): never => {
  if (error instanceof PaymentServiceError) throw new ServiceUnavailableException('Cards are unavailable right now, so no Fare could be held. Try again in a moment.');
  throw error;
};

/** The money side of a Rider's Ride Requests: what is held, and what becomes of it. */
@Injectable()
export class RidePaymentService {
  private readonly logger = new Logger(RidePaymentService.name);
  /** Payments being charged or released now, so that none is asked for twice at once. */
  private readonly settling = new Map<string, Promise<void>>();
  private readonly failedAtMs = new Map<string, number>();

  constructor(
    private readonly payments: PaymentService,
    private readonly methods: PaymentMethodRepository,
    private readonly ridePayments: RidePaymentRepository,
    private readonly clock: SimulationClock,
  ) {}

  /** Without payments set up, Rides are free and nothing is held. */
  get required(): boolean {
    return this.payments.publishableKey !== null;
  }

  /** Holds the quoted Fare on the Rider's default method, and gives the payment's id. */
  async hold(accountId: string, ride: QuotedRide): Promise<string> {
    const method = (await this.methods.findByAccount(accountId)).find((candidate) => candidate.isDefault);
    const customerRef = await this.methods.findCustomerRef(accountId);
    if (!method || !customerRef) throw noMethod();
    const id = randomUUID();
    const { amountCents, ...asked } = ride;
    await this.ridePayments.add({ ...asked, id, accountId, rideRequestId: null, holdRef: null, status: 'pending', heldCents: amountCents, chargeCents: null, requestedAtMs: this.clock.now().getTime(), settledAtMs: null, retriedAtMs: null });
    let placed: PlacedHold;
    try {
      placed = await this.payments.placeHold({ customerRef, methodRef: method.ref, amountCents, reference: id });
    } catch (error) {
      await this.close(id, 'released');
      return unavailable(error);
    }
    if (placed.status === 'declined') {
      await this.close(id, 'declined');
      throw declined(placed.message);
    }
    await this.ridePayments.update(id, { holdRef: placed.ref }, 'pending');
    if (placed.status === 'verification') {
      const message = 'Your bank needs to verify this payment.';
      throw refused({ code: 'PAYMENT_VERIFICATION', message, holdId: id, clientSecret: placed.clientSecret, publishableKey: this.payments.publishableKey! });
    }
    return id;
  }

  /** Gives the id of a hold the Rider has been to their bank about, if it passed and is for this Fare. Otherwise it counts as failed. */
  async confirm(accountId: string, holdId: unknown, { vehicleType, amountCents }: QuotedRide): Promise<string> {
    const payment = isPaymentId(holdId) ? await this.ridePayments.find(accountId, holdId) : null;
    if (payment?.status !== 'pending' || !payment.holdRef) throw unverified();
    // The payment service being away says nothing about the check, so the hold is left to be asked about again.
    const status = await this.payments.findHold(payment.holdRef).catch(unavailable);
    if (status === 'held' && payment.vehicleType === vehicleType && payment.heldCents === amountCents) return payment.id;
    await this.release(payment);
    await this.settle(accountId);
    throw unverified();
  }

  /**
   * Holds the Fare of a Ride Request once more, for one whose hold was released when it could not finish.
   * Null for one that never had a hold, as payments were not set up when it was made.
   */
  async holdAgain(accountId: string, rideRequestId: string, holdId: unknown): Promise<string | null> {
    const earlier = await this.ridePayments.findLatest(accountId, rideRequestId);
    if (!earlier) return null;
    const { vehicleType, pickupName, dropoffName, trip, heldCents } = earlier;
    const quoted = { vehicleType, pickupName, dropoffName, trip, amountCents: heldCents };
    return holdId === undefined ? this.hold(accountId, quoted) : this.confirm(accountId, holdId, quoted);
  }

  /** Releases the hold of a Ride Request that was not made after all. */
  async abandon(accountId: string, id: string): Promise<void> {
    const payment = await this.ridePayments.find(accountId, id);
    if (payment?.status !== 'pending') return;
    await this.release(payment);
    await this.settle(accountId);
  }

  /** Gives the held payment to the Ride Request it was placed for. */
  attach(id: string, rideRequestId: string): Promise<boolean> {
    return this.ridePayments.update(id, { rideRequestId, status: 'held' }, 'pending');
  }

  findOpen(accountId: string): Promise<RidePayment[]> {
    return this.ridePayments.findOpen(accountId);
  }

  findUnpaid(accountId: string): Promise<RidePayment[]> {
    return this.ridePayments.findUnpaid(accountId);
  }

  /** Refuses an account with a Fare still due. */
  async assertPaidUp(accountId: string): Promise<void> {
    if ((await this.findUnpaid(accountId)).length) throw fareUnpaid();
  }

  findAccountsWithOpen(): Promise<string[]> {
    return this.ridePayments.findAccountsWithOpen();
  }

  /** Makes the Fare of the Ride travelled due, never above the Fare that was quoted and held. */
  async charge({ id, status, heldCents }: RidePayment, { distanceM, durationS }: Trip, fareCents: number): Promise<void> {
    await this.ridePayments.update(id, { status: 'charging', trip: { distanceM, durationS }, chargeCents: Math.min(fareCents, heldCents) }, status);
  }

  /** Makes the whole hold due to be released. */
  async release({ id, status }: RidePayment): Promise<void> {
    await this.ridePayments.update(id, { status: 'releasing' }, status);
  }

  /** Charges and releases what is due for the account. */
  async settle(accountId: string): Promise<void> {
    try {
      await Promise.all((await this.findOpen(accountId)).map((payment) => this.settleOnce(payment)));
    } catch (error) {
      this.logger.warn(`Payments could not be settled: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private settleOnce(payment: RidePayment): Promise<void> {
    const { id } = payment;
    if (!this.isDue(payment)) return Promise.resolve();
    const already = this.settling.get(id);
    if (already) return already;
    const failedAtMs = this.failedAtMs.get(id);
    if (failedAtMs !== undefined && this.clock.now().getTime() - failedAtMs < RETRY_AFTER_MS) return Promise.resolve();
    const done = this.carryOut(payment)
      .then(
        () => void this.failedAtMs.delete(id),
        (error: unknown) => {
          if (!(error instanceof PaymentServiceError)) throw error;
          this.failedAtMs.set(id, this.clock.now().getTime());
        },
      )
      .finally(() => this.settling.delete(id));
    this.settling.set(id, done);
    return done;
  }

  private isDue({ status, retriedAtMs }: RidePayment): boolean {
    if (status === 'retrying') return this.clock.now().getTime() - retriedAtMs! >= VERIFY_WITHIN_MS;
    return status === 'charging' || status === 'releasing';
  }

  private async carryOut({ id, status, holdRef, chargeCents }: RidePayment): Promise<void> {
    const settledAtMs = () => this.clock.now().getTime();
    if (status === 'releasing') {
      // One that never got as far as a hold has nothing to release.
      if (holdRef) await this.payments.releaseHold(holdRef);
      await this.ridePayments.update(id, { status: 'released', settledAtMs: settledAtMs() }, status);
      return;
    }
    if (status === 'retrying') {
      // The Rider never came back from their bank. The Fare is still due.
      await this.payments.releaseHold(holdRef!);
      await this.ridePayments.update(id, { status: 'unpaid' }, status);
      return;
    }
    try {
      await this.payments.captureHold(holdRef!, chargeCents!);
    } catch (error) {
      if (!(error instanceof HoldLostError)) throw error;
      await this.ridePayments.update(id, { status: 'unpaid', settledAtMs: settledAtMs() }, status);
      return;
    }
    await this.ridePayments.update(id, { status: 'charged', settledAtMs: settledAtMs() }, status);
  }

  private close(id: string, status: RidePayment['status']): Promise<boolean> {
    return this.ridePayments.update(id, { status, settledAtMs: this.clock.now().getTime() }, 'pending');
  }
}
