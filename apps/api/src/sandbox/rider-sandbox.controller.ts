import { Body, Controller, Headers, Put, UseGuards } from '@nestjs/common';
import type { SandboxResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { parseCoordinate } from '../routing/requested-route.js';
import { SandboxRateLimitGuard } from '../security/rate-limiter.js';
import { SandboxService } from './sandbox.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider')
export class RiderSandboxController {
  constructor(
    private readonly auth: AuthService,
    private readonly sandboxes: SandboxService,
  ) {}

  @Put('sandbox')
  @UseGuards(SandboxRateLimitGuard)
  async open(@Headers('authorization') authorization: string | undefined, @Body() body: { centre?: unknown; fresh?: unknown }): Promise<SandboxResponse> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    const centre = parseCoordinate(body?.centre, 'The Sandbox centre');
    return this.sandboxes.open(account.id, centre, body.fresh === true);
  }
}
