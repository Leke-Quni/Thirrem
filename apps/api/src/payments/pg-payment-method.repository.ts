import { Injectable } from '@nestjs/common';
import type { Wallet } from '@thirrem/types';
import { DatabaseService } from '../database/database.service.js';
import { type PaymentMethodRecord, PaymentMethodRepository } from './payment-method.repository.js';
import type { Card } from './payment.service.js';

interface PaymentMethodRow {
  id: string;
  stripe_method_ref: string;
  brand: string;
  last4: string;
  wallet: Wallet | null;
  is_default: boolean;
}

const toRecord = (row: PaymentMethodRow): PaymentMethodRecord => ({
  id: row.id,
  ref: row.stripe_method_ref,
  brand: row.brand,
  last4: row.last4,
  wallet: row.wallet,
  isDefault: row.is_default,
});

@Injectable()
export class PgPaymentMethodRepository extends PaymentMethodRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findCustomerRef(accountId: string): Promise<string | null> {
    const { rows } = await this.database.query<{ stripe_customer_ref: string }>(
      'SELECT stripe_customer_ref FROM payment_customers WHERE account_id = $1',
      [accountId],
    );
    return rows[0]?.stripe_customer_ref ?? null;
  }

  async saveCustomerRef(accountId: string, customerRef: string): Promise<string> {
    // No conflict target: two requests saving the same customer at once can trip either unique column.
    await this.database.query(
      'INSERT INTO payment_customers (account_id, stripe_customer_ref) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accountId, customerRef],
    );
    return (await this.findCustomerRef(accountId))!;
  }

  async findByAccount(accountId: string): Promise<PaymentMethodRecord[]> {
    const { rows } = await this.database.query<PaymentMethodRow>(
      `SELECT m.id, m.stripe_method_ref, m.brand, m.last4, m.wallet,
              m.id IS NOT DISTINCT FROM c.default_method_id AS is_default
       FROM payment_methods m JOIN payment_customers c ON c.account_id = m.account_id
       WHERE m.account_id = $1 ORDER BY m.created_order`,
      [accountId],
    );
    return rows.map(toRecord);
  }

  async add(accountId: string, card: Card): Promise<void> {
    await this.database.query(
      `INSERT INTO payment_methods (account_id, stripe_method_ref, brand, last4, wallet) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (stripe_method_ref) DO NOTHING`,
      [accountId, card.ref, card.brand, card.last4, card.wallet],
    );
    await this.fillDefault(accountId);
  }

  async setDefault(accountId: string, id: string): Promise<void> {
    await this.database.query('UPDATE payment_customers SET default_method_id = $2 WHERE account_id = $1', [accountId, id]);
  }

  async remove(accountId: string, id: string): Promise<void> {
    // The foreign key clears the default if this was it.
    await this.database.query('DELETE FROM payment_methods WHERE account_id = $1 AND id = $2', [accountId, id]);
    await this.fillDefault(accountId);
  }

  private async fillDefault(accountId: string): Promise<void> {
    await this.database.query(
      `UPDATE payment_customers SET default_method_id =
         (SELECT id FROM payment_methods WHERE account_id = $1 ORDER BY created_order DESC LIMIT 1)
       WHERE account_id = $1 AND default_method_id IS NULL`,
      [accountId],
    );
  }
}
