import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';
import { PaymentMethodRepository } from './payment-method.repository.js';
import { isPaymentId, refused } from './payment-refusal.js';
import { PaymentService, PaymentServiceError } from './payment.service.js';
import { cardOf, type HeldCard, type RidePayment, RidePaymentRepository } from './ride-payment.repository.js';
import { RidePaymentService } from './ride-payment.service.js';

const noMethod = () => refused({ code: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method to pay your Fare.' });

const declined = (reason: string) => refused({ code: 'PAYMENT_DECLINED', message: `${reason} Your Fare is still unpaid. Try again, or choose another method.` });

const unverified = () => refused({ code: 'PAYMENT_DECLINED', message: 'Your bank did not verify the payment. Your Fare is still unpaid. Try again, or choose another method.' });

const unavailable = (error: unknown): never => {
  if (error instanceof PaymentServiceError) throw new ServiceUnavailableException('Cards are unavailable right now, so your Fare was not paid. Try again in a moment.');
  throw error;
};

/** Paying a Fare that could not be charged when its Ride ended. */
@Injectable()
export class FarePaymentService {
  /** The Fares being paid now, so that none is held twice at once. */
  private readonly paying = new Set<string>();

  constructor(
    private readonly payments: PaymentService,
    private readonly methods: PaymentMethodRepository,
    private readonly ridePayments: RidePaymentRepository,
    private readonly ridePaymentService: RidePaymentService,
    private readonly clock: SimulationClock,
  ) {}

  /**
   * Charges the amount due to the method `methodId`, or to the default one without it. With `holdId`, it takes up the hold
   * the Rider's bank has been asked to verify instead. Changes nothing for a Fare already paid.
   */
  async pay(accountId: string, id: string, methodId: unknown, holdId: unknown): Promise<void> {
    if (this.paying.has(id)) throw new ConflictException('This Fare is already being paid.');
    this.paying.add(id);
    try {
      const fare = await this.find(accountId, id);
      if (fare.status === 'charging' || fare.status === 'charged') return;
      if (holdId !== undefined) await this.confirm(fare, holdId);
      else await this.holdAndCharge(fare.status === 'retrying' ? await this.drop(fare) : fare, methodId);
    } finally {
      this.paying.delete(id);
    }
  }

  private async find(accountId: string, id: string): Promise<RidePayment> {
    const payment = isPaymentId(id) ? await this.ridePayments.find(accountId, id) : null;
    // Only a payment whose Fare has fallen due can be paid.
    if (!payment || !['unpaid', 'retrying', 'charging', 'charged'].includes(payment.status)) throw new NotFoundException('There is no such Fare to pay.');
    return payment;
  }

  private async holdAndCharge(fare: RidePayment, methodId: unknown): Promise<void> {
    const saved = await this.methods.findByAccount(fare.accountId);
    const method = saved.find((candidate) => (methodId === undefined ? candidate.isDefault : candidate.id === methodId));
    const customerRef = await this.methods.findCustomerRef(fare.accountId);
    if (!method && methodId !== undefined) throw new NotFoundException('That payment method is no longer saved.');
    if (!method || !customerRef) throw noMethod();
    // A new reference each time, as asking again with an old one would give back the old hold.
    const placed = await this.payments.placeHold({ customerRef, methodRef: method.ref, amountCents: fare.chargeCents!, reference: randomUUID() }).catch(unavailable);
    if (placed.status === 'declined') throw declined(placed.message);
    if (placed.status === 'held') return this.charge(fare, placed.ref, cardOf(method));
    await this.ridePayments.update(fare.id, { holdRef: placed.ref, card: cardOf(method), status: 'retrying', retriedAtMs: this.clock.now().getTime() }, fare.status);
    throw refused({ code: 'PAYMENT_VERIFICATION', message: 'Your bank needs to verify this payment.', holdId: fare.id, clientSecret: placed.clientSecret, publishableKey: this.payments.publishableKey! });
  }

  /** Charges the hold waiting on the Rider's bank if the check passed. Otherwise it counts as failed. */
  private async confirm(fare: RidePayment, holdId: unknown): Promise<void> {
    if (fare.status !== 'retrying' || holdId !== fare.id) throw unverified();
    // The payment service being away says nothing about the check, so the hold is left to be asked about again.
    if ((await this.payments.findHold(fare.holdRef!).catch(unavailable)) === 'held') return this.charge(fare, fare.holdRef!, fare.card);
    await this.drop(fare);
    throw unverified();
  }

  /** Releases the hold waiting on the Rider's bank, and gives the Fare as it then is. */
  private async drop(fare: RidePayment): Promise<RidePayment> {
    await this.payments.releaseHold(fare.holdRef!).catch(unavailable);
    await this.ridePayments.update(fare.id, { status: 'unpaid' }, fare.status);
    return { ...fare, status: 'unpaid' };
  }

  private async charge({ id, accountId, status }: RidePayment, holdRef: string, card: HeldCard | null): Promise<void> {
    await this.ridePayments.update(id, { holdRef, card: card ?? undefined, status: 'charging', settledAtMs: null }, status);
    await this.ridePaymentService.settle(accountId);
    // A charge the payment service did not answer is tried again until it does, as the money is held.
    if ((await this.ridePayments.find(accountId, id))?.status === 'unpaid') throw declined('Your card was declined.');
  }
}
