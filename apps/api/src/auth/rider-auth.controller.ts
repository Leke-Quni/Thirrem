import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import type { MeResponse, SessionResponse } from '@thirrem/types';
import { AuthService } from './auth.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('rider')
export class RiderAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/signup')
  signup(@Body() body: { email?: unknown; password?: unknown }): Promise<SessionResponse> {
    return this.auth.signup('rider', body?.email, body?.password);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: { email?: unknown; password?: unknown }): Promise<SessionResponse> {
    return this.auth.login('rider', body?.email, body?.password);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string): Promise<MeResponse> {
    const account = await this.auth.authenticate('rider', bearerToken(authorization));
    return { email: account.email };
  }
}
