import { CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT = Symbol('RATE_LIMIT');

interface Window {
  startedAt: number;
  count: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: SimulationClock,
    @Inject(RATE_LIMIT) private readonly options: RateLimitOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const key = request.ip ?? 'unknown';
    const now = this.clock.now().getTime();
    this.evictExpired(now);
    const current = this.windows.get(key);
    const window = current && now - current.startedAt < this.options.windowMs ? current : { startedAt: now, count: 0 };
    window.count += 1;
    this.windows.set(key, window);
    if (window.count > this.options.limit) {
      throw new HttpException('Too many attempts. Please wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private evictExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.options.windowMs) this.windows.delete(key);
    }
  }
}
