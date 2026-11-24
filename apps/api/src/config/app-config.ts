export interface AppConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  production: boolean;
  trustProxy: boolean;
  osrmUrl: string;
  routeRateLimit: { limit: number; windowMs: number };
  authRateLimit: { limit: number; windowMs: number };
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
    osrmUrl: (env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/$/, ''),
    authRateLimit: { limit: Number(env.AUTH_RATE_LIMIT ?? 10), windowMs: 60_000 },
  };
}
