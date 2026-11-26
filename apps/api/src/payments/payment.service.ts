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

/** A hold that can no longer be charged, as it was released or expired, or its card refused the charge. */
export class HoldLostError extends PaymentServiceError {}

export interface HoldRequest {
  customerRef: string;
  methodRef: string;
  amountCents: number;
  /** Asking again with the same one places no second hold. */
  reference: string;
}

export type PlacedHold =
  | { status: 'held'; ref: string }
  /** The Rider's bank wants to check it is them, which the app does with `clientSecret`. */
  | { status: 'verification'; ref: string; clientSecret: string }
  | { status: 'declined'; message: string };

export type HoldStatus = PlacedHold['status'] | 'charged' | 'released';

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
  /** Reserves an amount in euro cents on a saved card without charging it. */
  abstract placeHold(request: HoldRequest): Promise<PlacedHold>;
  abstract findHold(ref: string): Promise<HoldStatus>;
  /** Charges up to the amount held and releases the rest. Succeeds for a hold already charged. */
  abstract captureHold(ref: string, amountCents: number): Promise<void>;
  /** Succeeds for a hold already released. */
  abstract releaseHold(ref: string): Promise<void>;
}
