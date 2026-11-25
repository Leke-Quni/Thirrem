import { type FareRates, FARE_RATES } from '../fares/fare-rates.js';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  production: boolean;
  trustProxy: boolean;
  osrmUrl: string;
  photonUrl: string;
  searchRateLimit: { limit: number; windowMs: number };
  routeRateLimit: { limit: number; windowMs: number };
  authRateLimit: { limit: number; windowMs: number };
  fareRates: FareRates;
  live: { intervalMs: number; helloTimeoutMs: number };
  sandboxSweepMs: number;
  /** The most Sandboxes that run at once. */
  sandboxLimit: number;
  dispatch: {
    /** How long a broadcast waits for a Driver to accept before the search widens. */
    acceptWindowMs: number;
    /** How long after the broadcast a simulated Driver accepts. */
    acceptAfterMs: { min: number; max: number };
  };
}

const DEV_DATABASE_URL = 'postgres://thirrem:thirrem@localhost:5433/thirrem';
const DEV_CORS_ORIGINS = ['http://localhost:5002', 'http://localhost:5003', 'http://localhost:5004'];

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  const configured = splitList(env.CORS_ORIGINS);
  return {
    port: Number(env.PORT ?? 5001),
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    corsOrigins: production ? configured : [...DEV_CORS_ORIGINS, ...configured],
    production,
    trustProxy: env.TRUST_PROXY === 'true',
    routeRateLimit: { limit: Number(env.ROUTE_RATE_LIMIT ?? 30), windowMs: 60_000 },
    photonUrl: (env.PHOTON_URL ?? 'https://photon.komoot.io').replace(/\/$/, ''),
    searchRateLimit: { limit: Number(env.SEARCH_RATE_LIMIT ?? 60), windowMs: 60_000 },
    osrmUrl: (env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/$/, ''),
    authRateLimit: { limit: Number(env.AUTH_RATE_LIMIT ?? 10), windowMs: 60_000 },
    fareRates: FARE_RATES,
    live: { intervalMs: 1_000, helloTimeoutMs: 5_000 },
    sandboxSweepMs: 60_000,
    sandboxLimit: 30,
    dispatch: { acceptWindowMs: Number(env.DISPATCH_ACCEPT_WINDOW_MS ?? 9_000), acceptAfterMs: { min: 2_000, max: 8_000 } },
  };
}
