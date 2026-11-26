import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { RidePaymentService } from '../payments/ride-payment.service.js';
import { JourneyLedger } from '../sandbox/journey-ledger.js';
import { SandboxService } from '../sandbox/sandbox.service.js';

/** Charges and releases Fares as they fall due, whether or not the Rider has the app open. */
@Injectable()
export class RideSettlementTimer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RideSettlementTimer.name);
  private timer?: NodeJS.Timeout;
  private looking = false;

  constructor(
    private readonly payments: RidePaymentService,
    private readonly sandboxes: SandboxService,
    private readonly ledger: JourneyLedger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.settleAll(), this.config.settleMs).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async settleAll(): Promise<void> {
    // A slow payment service must not have one look overlap the next.
    if (this.looking) return;
    this.looking = true;
    try {
      for (const accountId of await this.payments.findAccountsWithOpen()) {
        await this.sandboxes.inspect(accountId, (sandbox, nowMs) => this.ledger.record(accountId, sandbox, nowMs));
        // Not waited for, so that one Rider's slow charge does not hold up the next.
        void this.ledger.settle(accountId);
      }
    } catch (error) {
      this.logger.warn(`Fares could not be settled: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.looking = false;
    }
  }
}
