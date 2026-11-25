import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { RideRequest } from '@thirrem/types';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { broadcast, type RideRequestInput, rideRequestView } from './ride-request.js';

@Injectable()
export class RideRequestService {
  constructor(
    private readonly sandboxes: SandboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  request(accountId: string, input: RideRequestInput): Promise<RideRequest> {
    return this.sandboxes.change(accountId, (sandbox, drivers, nowMs) => {
      if (sandbox.rideRequest) throw new ConflictException('You already have an open Ride Request.');
      const rideRequest = broadcast(randomUUID(), input, drivers, this.config.dispatch, nowMs, Math.random);
      return { sandbox: { ...sandbox, rideRequest }, result: rideRequestView(rideRequest, null) };
    });
  }
}
