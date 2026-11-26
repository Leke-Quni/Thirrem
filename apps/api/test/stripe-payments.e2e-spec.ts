import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { HoldLostError } from '../src/payments/payment.service.js';
import { StripePaymentService, toCard } from '../src/payments/stripe-payment.service.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
const secretKey = process.env.STRIPE_SECRET_KEY ?? (existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).STRIPE_SECRET_KEY : undefined);

describe('A card as Stripe describes it', () => {
  const described = (wallet: object | null) => toCard({ id: 'pm_1', card: { brand: 'visa', last4: '4242', fingerprint: 'fp_1', wallet } } as unknown as Stripe.PaymentMethod);

  it('names the wallet for Apple Pay and Google Pay only', () => {
    expect(described({ type: 'apple_pay' }).wallet).toBe('apple_pay');
    expect(described({ type: 'google_pay' }).wallet).toBe('google_pay');
    expect(described({ type: 'link' }).wallet).toBeNull();
    expect(described(null)).toEqual({ ref: 'pm_1', brand: 'visa', last4: '4242', wallet: null, fingerprint: 'fp_1' });
  });
});

describe('A charge Stripe refuses', () => {
  /** Stripe, as it answers a capture with a card error and leaves the hold standing. */
  function refusing() {
    const payments = new StripePaymentService({ secretKey: 'sk_test_unused', publishableKey: 'pk_test_unused' });
    const cancelled: string[] = [];
    const paymentIntents = {
      capture: async () => {
        throw new Stripe.errors.StripeCardError({ type: 'card_error', message: 'Your card was declined.' });
      },
      retrieve: async () => ({ status: 'requires_capture' }),
      cancel: async (ref: string) => void cancelled.push(ref),
    };
    Object.assign(payments, { stripe: { paymentIntents } });
    return { payments, cancelled };
  }

  it('is a Fare to be paid again, and its hold is released', async () => {
    const { payments, cancelled } = refusing();

    await expect(payments.captureHold('pi_1', 500)).rejects.toThrow(HoldLostError);

    expect(cancelled).toEqual(['pi_1']);
  });
});

// These talk to Stripe test mode, so they run only where a test key is configured.
describe.skipIf(!secretKey?.includes('_test_'))('Stripe in test mode', () => {
  const service = () => new StripePaymentService({ secretKey: secretKey!, publishableKey: 'pk_test_unused' });
  const stripe = () => new Stripe(secretKey!);

  it('gives the same customer when asked twice for one account', async () => {
    const accountId = randomUUID();

    expect(await service().createCustomer(accountId)).toBe(await service().createCustomer(accountId));
  });

  it('saves a card once its setup has succeeded, for its own customer only', async () => {
    const payments = service();
    const customer = await payments.createCustomer(randomUUID());
    const { clientSecret } = await payments.startSetup(customer);
    const setupId = clientSecret.split('_secret_')[0]!;
    expect(await payments.findSetupCard(customer, setupId)).toBeNull();

    // Stands in for the Rider submitting Stripe's card form.
    await stripe().setupIntents.confirm(setupId, { payment_method: 'pm_card_mastercard', return_url: 'https://example.com' });

    expect(await payments.findSetupCard(customer, setupId)).toEqual({ ref: expect.stringMatching(/^pm_/), brand: 'mastercard', last4: '4444', wallet: null, fingerprint: expect.any(String) });
    expect(await payments.findSetupCard(await payments.createCustomer(randomUUID()), setupId)).toBeNull();
    expect(await payments.findSetupCard(customer, 'seti_does_not_exist')).toBeNull();

    await payments.forgetCard((await payments.findSetupCard(customer, setupId))!.ref);
    expect(await payments.findSetupCard(customer, setupId)).toBeNull();
  });

  it('gives two copies of one card the same fingerprint', async () => {
    const payments = service();
    const customer = await payments.createCustomer(randomUUID());

    const first = await payments.saveTestCard(customer);
    const second = await payments.saveTestCard(customer);

    expect(second.ref).not.toBe(first.ref);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect((await payments.listCards(customer)).map((card) => card.fingerprint)).toEqual([first.fingerprint, first.fingerprint]);
    await Promise.all([payments.forgetCard(first.ref), payments.forgetCard(second.ref)]);
  });

  it('adds a test card and forgets it, more than once if asked', async () => {
    const payments = service();
    const customer = await payments.createCustomer(randomUUID());

    const card = await payments.saveTestCard(customer);
    expect(card).toEqual({ ref: expect.stringMatching(/^pm_/), brand: 'visa', last4: '4242', wallet: null, fingerprint: expect.any(String) });
    expect((await stripe().customers.listPaymentMethods(customer)).data.map((method) => method.id)).toEqual([card.ref]);

    await payments.forgetCard(card.ref);
    await payments.forgetCard(card.ref);

    expect((await stripe().customers.listPaymentMethods(customer)).data).toEqual([]);
  });

  /** A customer with one of Stripe's test cards saved, as the Rider's default method would be. */
  async function withCard(testCard: string) {
    const customerRef = await service().createCustomer(randomUUID());
    const { id: methodRef } = await stripe().paymentMethods.attach(testCard, { customer: customerRef });
    return { customerRef, methodRef };
  }

  const hold = async (testCard: string, amountCents = 500) => service().placeHold({ ...(await withCard(testCard)), amountCents, reference: randomUUID() });

  const intent = (ref: string) => stripe().paymentIntents.retrieve(ref);

  it('holds an amount without charging it, then charges part of it and releases the rest', async () => {
    const payments = service();
    const placed = await hold('pm_card_visa');
    expect(placed).toEqual({ status: 'held', ref: expect.stringMatching(/^pi_/) });
    const ref = (placed as { ref: string }).ref;
    expect(await intent(ref)).toMatchObject({ amount: 500, currency: 'eur', amount_capturable: 500, amount_received: 0 });
    expect(await payments.findHold(ref)).toBe('held');

    await payments.captureHold(ref, 320);
    await payments.captureHold(ref, 320);

    expect(await intent(ref)).toMatchObject({ status: 'succeeded', amount_received: 320, amount_capturable: 0 });
    expect(await payments.findHold(ref)).toBe('charged');
  });

  it('releases a whole hold, more than once if asked, and cannot charge it afterwards', async () => {
    const payments = service();
    const { ref } = (await hold('pm_card_visa')) as { ref: string };

    await payments.releaseHold(ref);
    await payments.releaseHold(ref);

    expect(await intent(ref)).toMatchObject({ status: 'canceled', amount_received: 0 });
    expect(await payments.findHold(ref)).toBe('released');
    await expect(payments.captureHold(ref, 100)).rejects.toThrow(HoldLostError);
  });

  it('says why a card was declined, and holds nothing', async () => {
    expect(await hold('pm_card_chargeCustomerFail')).toEqual({ status: 'declined', message: expect.stringMatching(/declined/i) });
  });

  it('asks for the bank to verify a card that needs it', async () => {
    const placed = await hold('pm_card_authenticationRequired');

    expect(placed).toEqual({ status: 'verification', ref: expect.stringMatching(/^pi_/), clientSecret: expect.stringContaining('_secret_') });
    expect(await service().findHold((placed as { ref: string }).ref)).toBe('verification');
  });

  it('keeps a hold chargeable after its card is forgotten', async () => {
    const payments = service();
    const card = await withCard('pm_card_visa');
    const { ref } = (await payments.placeHold({ ...card, amountCents: 500, reference: randomUUID() })) as { ref: string };

    await payments.forgetCard(card.methodRef);
    await payments.captureHold(ref, 500);

    expect(await intent(ref)).toMatchObject({ status: 'succeeded', amount_received: 500 });
  });
});
