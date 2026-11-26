import { Injectable } from '@nestjs/common';
import type { UnpaidFare } from '@thirrem/types';
import { FarePaymentService } from '../payments/fare-payment.service.js';
import type { RidePayment } from '../payments/ride-payment.repository.js';
import { RidePaymentService } from '../payments/ride-payment.service.js';
import { JourneyLedger } from '../sandbox/journey-ledger.js';
import { SandboxService } from '../sandbox/sandbox.service.js';

const toUnpaidFare = ({ id, chargeCents, vehicleType, pickupName, dropoffName, requestedAtMs }: RidePayment): UnpaidFare => ({
  id,
  amountCents: chargeCents!,
  currency: 'EUR',
  vehicleType,
  pickupName,
  dropoffName,
  requestedAt: new Date(requestedAtMs).toISOString(),
});

/** The Fares a Rider still owes. */
@Injectable()
export class UnpaidFareService {
  constructor(
    private readonly payments: RidePaymentService,
    private readonly sandboxes: SandboxService,
    private readonly ledger: JourneyLedger,
    private readonly farePayments: FarePaymentService,
  ) {}

  /** Charges what has fallen due, without waiting for the API's timer to look. */
  async bringUpToDate(accountId: string): Promise<void> {
    await this.sandboxes.inspect(accountId, (sandbox, nowMs) => this.ledger.record(accountId, sandbox, nowMs));
    await this.ledger.settle(accountId);
  }

  async list(accountId: string): Promise<UnpaidFare[]> {
    await this.bringUpToDate(accountId);
    return (await this.payments.findUnpaid(accountId)).map(toUnpaidFare);
  }

  pay(accountId: string, id: string, methodId: unknown, holdId: unknown): Promise<void> {
    return this.farePayments.pay(accountId, id, methodId, holdId);
  }
}
