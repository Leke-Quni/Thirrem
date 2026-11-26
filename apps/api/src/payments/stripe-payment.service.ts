import { Logger } from '@nestjs/common';
import type { Wallet } from '@thirrem/types';
import Stripe from 'stripe';
import type { StripeKeys } from '../config/app-config.js';
import { type Card, HoldLostError, type HoldRequest, type HoldStatus, PaymentService, PaymentServiceError, type PlacedHold } from './payment.service.js';

/** A saved card has to be chargeable later, when the Rider is not there. Wallets are cards to Stripe. */
const CARD_SETUP = { usage: 'off_session', allowed_payment_method_types: ['card'] } satisfies Stripe.SetupIntentCreateParams;

const toWallet = (type: string | undefined): Wallet | null => (type === 'apple_pay' || type === 'google_pay' ? (type as Wallet) : null);

export function toCard(method: Stripe.PaymentMethod): Card {
  const { brand, last4, wallet, fingerprint } = method.card!;
  // Stripe gives every card a fingerprint; without one a card is only ever the same as itself.
  return { ref: method.id, brand, last4, wallet: toWallet(wallet?.type), fingerprint: fingerprint ?? method.id };
}

const HOLD_STATUSES: Record<Stripe.PaymentIntent.Status, HoldStatus> = {
  requires_capture: 'held',
  requires_action: 'verification',
  requires_confirmation: 'verification',
  processing: 'verification',
  requires_payment_method: 'declined',
  succeeded: 'charged',
  canceled: 'released',
};

const isMissing = (error: unknown) => error instanceof Stripe.errors.StripeError && error.code === 'resource_missing';

export class StripePaymentService extends PaymentService {
  readonly publishableKey: string;
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripePaymentService.name);

  constructor(keys: StripeKeys) {
    super();
    this.publishableKey = keys.publishableKey;
    this.stripe = new Stripe(keys.secretKey);
  }

  createCustomer(accountId: string): Promise<string> {
    return this.call(async () => (await this.stripe.customers.create({ metadata: { accountId } }, { idempotencyKey: `rider-customer-${accountId}` })).id);
  }

  startSetup(customerRef: string): Promise<{ clientSecret: string }> {
    return this.call(async () => {
      const setup = await this.stripe.setupIntents.create({ ...CARD_SETUP, customer: customerRef });
      return { clientSecret: setup.client_secret! };
    });
  }

  findSetupCard(customerRef: string, setupId: string): Promise<Card | null> {
    return this.call(async () => {
      const setup = await this.stripe.setupIntents.retrieve(setupId, { expand: ['payment_method'] }).catch((error: unknown) => {
        if (isMissing(error)) return null;
        throw error;
      });
      if (setup?.status !== 'succeeded' || setup.customer !== customerRef) return null;
      const method = setup.payment_method as Stripe.PaymentMethod;
      // A card that has since been forgotten stays on its setup.
      return method.customer ? toCard(method) : null;
    });
  }

  saveTestCard(customerRef: string): Promise<Card> {
    return this.call(async () => {
      const setup = await this.stripe.setupIntents.create({
        ...CARD_SETUP,
        customer: customerRef,
        payment_method: 'pm_card_visa',
        confirm: true,
        expand: ['payment_method'],
      });
      return toCard(setup.payment_method as Stripe.PaymentMethod);
    });
  }

  listCards(customerRef: string): Promise<Card[]> {
    return this.call(async () => (await this.stripe.customers.listPaymentMethods(customerRef, { type: 'card', limit: 100 })).data.map(toCard));
  }

  forgetCard(ref: string): Promise<void> {
    return this.call(async () => {
      try {
        await this.stripe.paymentMethods.detach(ref);
      } catch (error) {
        if (isMissing(error) || !(await this.stripe.paymentMethods.retrieve(ref)).customer) return;
        throw error;
      }
    });
  }

  placeHold({ customerRef, methodRef, amountCents, reference }: HoldRequest): Promise<PlacedHold> {
    return this.call(async () => {
      try {
        const intent = await this.stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: 'eur',
            customer: customerRef,
            payment_method: methodRef,
            allowed_payment_method_types: ['card'],
            capture_method: 'manual',
            confirm: true,
          },
          { idempotencyKey: `ride-hold-${reference}` },
        );
        if (intent.status === 'requires_capture') return { status: 'held', ref: intent.id };
        if (intent.status === 'requires_action') return { status: 'verification', ref: intent.id, clientSecret: intent.client_secret! };
        throw new Error(`A new hold was left ${intent.status}`);
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeCardError)) throw error;
        // A declined intent could be confirmed again, so it is closed.
        if (error.payment_intent) await this.stripe.paymentIntents.cancel(error.payment_intent.id);
        return { status: 'declined', message: error.message };
      }
    });
  }

  findHold(ref: string): Promise<HoldStatus> {
    return this.call(async () => HOLD_STATUSES[(await this.stripe.paymentIntents.retrieve(ref)).status]);
  }

  captureHold(ref: string, amountCents: number): Promise<void> {
    return this.call(async () => {
      try {
        await this.stripe.paymentIntents.capture(ref, { amount_to_capture: amountCents });
      } catch (error) {
        const { status } = await this.stripe.paymentIntents.retrieve(ref);
        if (status === 'succeeded') return;
        if (status === 'canceled') throw new HoldLostError('The hold was released before it could be charged');
        if (error instanceof Stripe.errors.StripeCardError) {
          // The card would refuse it again, so nothing is left held.
          await this.stripe.paymentIntents.cancel(ref);
          throw new HoldLostError(error.message);
        }
        throw error;
      }
    });
  }

  releaseHold(ref: string): Promise<void> {
    return this.call(async () => {
      try {
        await this.stripe.paymentIntents.cancel(ref);
      } catch (error) {
        if ((await this.stripe.paymentIntents.retrieve(ref)).status !== 'canceled') throw error;
      }
    });
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof PaymentServiceError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Stripe request failed: ${message}`);
      throw new PaymentServiceError(message);
    }
  }
}
