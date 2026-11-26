import { Body, Controller, Get, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { MeResponse, SessionResponse } from '@thirrem/types';
import { AuthRateLimitGuard } from '../security/rate-limiter.js';
import { AuthService } from './auth.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

@Controller('driver')
export class DriverAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/signup')
  @UseGuards(AuthRateLimitGuard)
  signup(@Body() body: { email?: unknown; password?: unknown }): Promise<SessionResponse> {
    return this.auth.signup('driver', body?.email, body?.password);
  }

  @Post('auth/login')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  login(@Body() body: { email?: unknown; password?: unknown }): Promise<SessionResponse> {
    return this.auth.login('driver', body?.email, body?.password);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string): Promise<MeResponse> {
    const account = await this.auth.authenticate('driver', bearerToken(authorization));
    return { email: account.email };
  }
}
