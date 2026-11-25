import { CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SimulationClock } from '../simulation-clock/simulation-clock.js';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT = Symbol('RATE_LIMIT');
export const ROUTE_RATE_LIMIT = Symbol('ROUTE_RATE_LIMIT');
export const SEARCH_RATE_LIMIT = Symbol('SEARCH_RATE_LIMIT');

interface Window {
  startedAt: number;
  count: number;
}

abstract class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  protected abstract readonly message: string;

  constructor(
    private readonly clock: SimulationClock,
    private readonly options: RateLimitOptions,
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
      throw new HttpException(this.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private evictExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.options.windowMs) this.windows.delete(key);
    }
  }
}

@Injectable()
export class AuthRateLimitGuard extends RateLimitGuard {
  protected readonly message = 'Too many attempts. Please wait a minute and try again.';

  constructor(clock: SimulationClock, @Inject(RATE_LIMIT) options: RateLimitOptions) {
    super(clock, options);
  }
}

@Injectable()
export class RouteRateLimitGuard extends RateLimitGuard {
  protected readonly message = 'Too many route requests. Please wait a minute and try again.';

  constructor(clock: SimulationClock, @Inject(ROUTE_RATE_LIMIT) options: RateLimitOptions) {
    super(clock, options);
  }
}

@Injectable()
export class FareRateLimitGuard extends RateLimitGuard {
  protected readonly message = 'Too many Fare requests. Please wait a minute and try again.';

  constructor(clock: SimulationClock, @Inject(ROUTE_RATE_LIMIT) options: RateLimitOptions) {
    super(clock, options);
  }
}

@Injectable()
export class SandboxRateLimitGuard extends RateLimitGuard {
  protected readonly message = 'Too many Sandbox requests. Please wait a minute and try again.';

  constructor(clock: SimulationClock, @Inject(ROUTE_RATE_LIMIT) options: RateLimitOptions) {
    super(clock, options);
  }
}

@Injectable()
export class SearchRateLimitGuard extends RateLimitGuard {
  protected readonly message = 'Too many searches. Please wait a minute and try again.';

  constructor(clock: SimulationClock, @Inject(SEARCH_RATE_LIMIT) options: RateLimitOptions) {
    super(clock, options);
  }
}
