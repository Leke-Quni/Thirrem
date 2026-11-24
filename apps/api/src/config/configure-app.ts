import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from './app-config.js';

const escapeRegExp = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const originMatcher = (pattern: string) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[a-z0-9-]+')}$`);

export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  if (config.trustProxy) app.set('trust proxy', true);
  const matchers = config.corsOrigins.map(originMatcher);
  app.enableCors({ origin: (origin, callback) => callback(null, !origin || matchers.some((m) => m.test(origin))) });
}
