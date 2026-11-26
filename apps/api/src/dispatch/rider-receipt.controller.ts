import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import type { Receipt, ReceiptsResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import { ReceiptService } from './receipt.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider/receipts')
export class RiderReceiptController {
  constructor(
    private readonly auth: AuthService,
    private readonly receipts: ReceiptService,
  ) {}

  /** 6 at a time. `after` is the `next` of the answer before. */
  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('after') after?: string): Promise<ReceiptsResponse> {
    return this.receipts.list(await this.accountId(authorization), after);
  }

  @Get(':id')
  async find(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<Receipt> {
    return this.receipts.find(await this.accountId(authorization), id);
  }

  private async accountId(authorization: string | undefined): Promise<string> {
    return (await this.auth.authenticate('rider', bearerToken(authorization))).id;
  }
}
