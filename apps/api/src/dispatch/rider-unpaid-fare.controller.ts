import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { UnpaidFaresResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { PaymentRateLimitGuard } from '../security/rate-limiter.js';
import { UnpaidFareService } from './unpaid-fare.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider/unpaid-fares')
export class RiderUnpaidFareController {
  constructor(
    private readonly auth: AuthService,
    private readonly unpaidFares: UnpaidFareService,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string): Promise<UnpaidFaresResponse> {
    return { fares: await this.unpaidFares.list(await this.accountId(authorization)) };
  }

  /** Pays it on `methodId`, or on the default method without one. `holdId` is that of a hold the Rider's bank has been asked to verify. The answer is what is still owed. */
  @Post(':id/payment')
  @UseGuards(PaymentRateLimitGuard)
  @HttpCode(200)
  async pay(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: { methodId?: unknown; holdId?: unknown } | undefined): Promise<UnpaidFaresResponse> {
    const accountId = await this.accountId(authorization);
    await this.unpaidFares.pay(accountId, id, body?.methodId, body?.holdId);
    return { fares: await this.unpaidFares.list(accountId) };
  }

  private async accountId(authorization: string | undefined): Promise<string> {
    return (await this.auth.authenticate('rider', bearerToken(authorization))).id;
  }
}
