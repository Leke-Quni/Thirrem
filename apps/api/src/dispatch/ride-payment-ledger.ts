import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { calculateFare } from '../fares/fare-calculator.js';
import type { RidePayment } from '../payments/ride-payment.repository.js';
import { RidePaymentService } from '../payments/ride-payment.service.js';
import { JourneyLedger } from '../sandbox/journey-ledger.js';
import { sandboxStatus, stoppedAtMs } from '../sandbox/sandbox-lifecycle.js';
import type { Sandbox } from '../sandbox/sandbox.repository.js';
import { type JourneyEnd, journeyEnd } from './ride-request.js';

/** How long a Rider has to pass their bank's check before the hold waiting on it is released. */
const VERIFY_WITHIN_MS = 10 * 60_000;

/** What the payment's journey came to, or null while it is still going. */
function endOf({ rideRequestId }: RidePayment, sandbox: Sandbox | null, nowMs: number, dropping: boolean): JourneyEnd | null {
  const rideRequest = sandbox?.rideRequest;
  // A journey whose Sandbox is gone, or has moved on from it, cannot finish.
  if (!sandbox || !rideRequest || rideRequest.id !== rideRequestId) return 'release';
  // Nothing drives while a Sandbox is stopped, so it keeps its hold, judged as of when it stopped.
  const end = journeyEnd(rideRequest, sandbox.resumedAtMs, Math.min(nowMs, stoppedAtMs(sandbox.lastActiveMs)));
  return end ?? (dropping || sandboxStatus(sandbox.lastActiveMs, nowMs) === 'discarded' ? 'release' : null);
}

/** Turns what happens to a Rider's journeys into what happens to the Fares held for them. */
@Injectable()
export class RidePaymentLedger extends JourneyLedger {
  constructor(
    private readonly payments: RidePaymentService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  async record(accountId: string, sandbox: Sandbox | null, nowMs: number, dropping = false): Promise<void> {
    for (const payment of await this.payments.findOpen(accountId)) {
      if (payment.status === 'pending') {
        if (nowMs - payment.requestedAtMs >= VERIFY_WITHIN_MS) await this.payments.release(payment);
        continue;
      }
      if (payment.status !== 'held') continue;
      const end = endOf(payment, sandbox, nowMs, dropping);
      if (end === 'release') await this.payments.release(payment);
      else if (end) await this.payments.charge(payment, end.charge, calculateFare(this.config.fareRates, payment.vehicleType, end.charge).amountCents);
    }
  }

  settle(accountId: string): Promise<void> {
    return this.payments.settle(accountId);
  }
}
