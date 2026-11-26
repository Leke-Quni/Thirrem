import { Logger } from '@nestjs/common';
import type { Wallet } from '@thirrem/types';
import Stripe from 'stripe';
import type { StripeKeys } from '../config/app-config.js';
import { type Card, PaymentService, PaymentServiceError } from './payment.service.js';

/** A saved card has to be chargeable later, when the Rider is not there. Wallets are cards to Stripe. */
const CARD_SETUP = { usage: 'off_session', allowed_payment_method_types: ['card'] } satisfies Stripe.SetupIntentCreateParams;

const toWallet = (type: string | undefined): Wallet | null => (type === 'apple_pay' || type === 'google_pay' ? (type as Wallet) : null);

export function toCard(method: Stripe.PaymentMethod): Card {
  const { brand, last4, wallet, fingerprint } = method.card!;
  // Stripe gives every card a fingerprint; without one a card is only ever the same as itself.
  return { ref: method.id, brand, last4, wallet: toWallet(wallet?.type), fingerprint: fingerprint ?? method.id };
}

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

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Stripe request failed: ${message}`);
      throw new PaymentServiceError(message);
    }
  }
}
