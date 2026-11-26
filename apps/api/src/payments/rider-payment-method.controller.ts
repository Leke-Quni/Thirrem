import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { CardSetupResponse, PaymentMethodsResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { PaymentRateLimitGuard } from '../security/rate-limiter.js';
import { PaymentMethodService } from './payment-method.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider/payment-methods')
export class RiderPaymentMethodController {
  constructor(
    private readonly auth: AuthService,
    private readonly methods: PaymentMethodService,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string): Promise<PaymentMethodsResponse> {
    return this.methods.list(await this.accountId(authorization));
  }

  @Post('setup')
  @UseGuards(PaymentRateLimitGuard)
  async startAdding(@Headers('authorization') authorization?: string): Promise<CardSetupResponse> {
    return this.methods.startAdding(await this.accountId(authorization));
  }

  @Post()
  @UseGuards(PaymentRateLimitGuard)
  async finishAdding(@Headers('authorization') authorization: string | undefined, @Body() body: { setupId?: unknown }): Promise<PaymentMethodsResponse> {
    return this.methods.finishAdding(await this.accountId(authorization), body?.setupId);
  }

  @Post('test-card')
  @UseGuards(PaymentRateLimitGuard)
  async addTestCard(@Headers('authorization') authorization?: string): Promise<PaymentMethodsResponse> {
    return this.methods.addTestCard(await this.accountId(authorization));
  }

  @Put(':id/default')
  @HttpCode(200)
  async makeDefault(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<PaymentMethodsResponse> {
    return this.methods.makeDefault(await this.accountId(authorization), id);
  }

  @Delete(':id')
  @UseGuards(PaymentRateLimitGuard)
  async remove(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<PaymentMethodsResponse> {
    return this.methods.remove(await this.accountId(authorization), id);
  }

  private async accountId(authorization: string | undefined): Promise<string> {
    return (await this.auth.authenticate('rider', bearerToken(authorization))).id;
  }
}
