import type { Card } from './payment.service.js';

export interface PaymentMethodRecord extends Omit<Card, 'fingerprint'> {
  id: string;
  isDefault: boolean;
}

export abstract class PaymentMethodRepository {
  abstract findCustomerRef(accountId: string): Promise<string | null>;
  /** Keeps the first customer saved for an account, and returns the one kept. */
  abstract saveCustomerRef(accountId: string, customerRef: string): Promise<string>;
  /** The account's methods, oldest first. */
  abstract findByAccount(accountId: string): Promise<PaymentMethodRecord[]>;
  /** Adds the card unless it is already saved. It becomes the default if there is none. */
  abstract add(accountId: string, card: Card): Promise<void>;
  abstract setDefault(accountId: string, id: string): Promise<void>;
  /** If the default is removed, the newest method left becomes the default. */
  abstract remove(accountId: string, id: string): Promise<void>;
}
