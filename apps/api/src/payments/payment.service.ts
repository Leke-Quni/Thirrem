import type { Wallet } from '@thirrem/types';

/** A card Stripe keeps. The full number and security code never reach the API. */
export interface Card {
  /** Stripe's reference to the card. */
  ref: string;
  brand: string;
  last4: string;
  wallet: Wallet | null;
  /** The same for every copy of one card number, so a second copy can be told. It is not kept in the database. */
  fingerprint: string;
}

export class PaymentServiceError extends Error {}

export class PaymentsNotSetUpError extends PaymentServiceError {}

export abstract class PaymentService {
  /** The key the app shows Stripe's card form with, or null when payments are not set up. */
  abstract readonly publishableKey: string | null;
  /** Asking again for the same account gives the same customer. */
  abstract createCustomer(accountId: string): Promise<string>;
  abstract startSetup(customerRef: string): Promise<{ clientSecret: string }>;
  /** The card a setup saved, or null if the setup has not succeeded or is not this customer's. */
  abstract findSetupCard(customerRef: string, setupId: string): Promise<Card | null>;
  abstract saveTestCard(customerRef: string): Promise<Card>;
  /** The cards Stripe keeps for a customer. */
  abstract listCards(customerRef: string): Promise<Card[]>;
  /** Succeeds for a card that is already forgotten. */
  abstract forgetCard(ref: string): Promise<void>;
}
