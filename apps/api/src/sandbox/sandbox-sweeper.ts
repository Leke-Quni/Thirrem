import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { DriverSandboxService } from './driver-sandbox.service.js';
import { SandboxService } from './sandbox.service.js';

/** Looks for Sandboxes due to be discarded, so one whose owner never returns does not stay in memory. */
@Injectable()
export class SandboxSweeper implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly sandboxes: SandboxService,
    private readonly driverSandboxes: DriverSandboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sandboxes.discardExpired();
      void this.driverSandboxes.discardExpired();
    }, this.config.sandboxSweepMs).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}
