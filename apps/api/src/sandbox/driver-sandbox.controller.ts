import { Body, Controller, Get, Headers, NotFoundException, Put, UseGuards } from '@nestjs/common';
import type { DriverSandboxResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { parseCoordinate } from '../routing/requested-route.js';
import { SandboxRateLimitGuard } from '../security/rate-limiter.js';
import { DriverSandboxService } from './driver-sandbox.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('driver')
export class DriverSandboxController {
  constructor(
    private readonly auth: AuthService,
    private readonly sandboxes: DriverSandboxService,
  ) {}

  @Put('sandbox')
  @UseGuards(SandboxRateLimitGuard)
  async open(@Headers('authorization') authorization: string | undefined, @Body() body: { centre?: unknown } | undefined): Promise<DriverSandboxResponse> {
    const account = await this.auth.authenticate('driver', bearerToken(authorization));
    return this.sandboxes.open(account.id, parseCoordinate(body?.centre, 'The Sandbox centre'));
  }

  @Get('sandbox')
  async read(@Headers('authorization') authorization?: string): Promise<DriverSandboxResponse> {
    const account = await this.auth.authenticate('driver', bearerToken(authorization));
    const sandbox = await this.sandboxes.read(account.id);
    if (!sandbox) throw new NotFoundException('You have no Sandbox.');
    return sandbox;
  }
}
