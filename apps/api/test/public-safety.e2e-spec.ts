import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/app-config.js';
import { SESSION_LIFETIME_MS } from '../src/auth/auth.service.js';
import { createTestApp, ManualClock } from './support/app.js';

const password = 'Correct-horse-battery';
const newEmail = () => `rider-${randomUUID()}@example.com`;

describe('Public exposure safety', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it('rejects an expired session and accepts one just before it expires', async () => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    app = await createTestApp({ clock });
    const http = () => request(app!.getHttpServer());
    const { body } = await http().post('/rider/auth/signup').send({ email: newEmail(), password }).expect(201);

    clock.advance(SESSION_LIFETIME_MS - 1000);
    await http().get('/rider/me').set('Authorization', `Bearer ${body.token}`).expect(200);

    clock.advance(2000);
    await http().get('/rider/me').set('Authorization', `Bearer ${body.token}`).expect(401);
  });

  it('rate limits signup and login per client and frees the client after the window', async () => {
    const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
    app = await createTestApp({ clock, rateLimit: { limit: 3, windowMs: 60_000 } });
    const http = () => request(app!.getHttpServer());
    const attempt = () => http().post('/rider/auth/login').send({ email: newEmail(), password });

    for (let i = 0; i < 3; i++) await attempt().expect(401);
    await attempt().expect(429);
    await http().post('/rider/auth/signup').send({ email: newEmail(), password }).expect(429);

    clock.advance(60_001);
    await attempt().expect(401);
  });

  it('keeps separate rate limits for separate clients behind a proxy', async () => {
    app = await createTestApp({ config: { trustProxy: true }, rateLimit: { limit: 1, windowMs: 60_000 } });
    const http = () => request(app!.getHttpServer());
    const login = (ip: string) => http().post('/rider/auth/login').set('X-Forwarded-For', ip).send({ email: newEmail(), password });

    await login('203.0.113.1').expect(401);
    await login('203.0.113.1').expect(429);
    await login('203.0.113.2').expect(401);
  });

  it('allows CORS only from the configured origins', async () => {
    app = await createTestApp({ config: { corsOrigins: ['https://thirrem-rider.vercel.app', 'https://thirrem-rider-*.vercel.app'] } });
    const http = () => request(app!.getHttpServer());

    const allowed = await http().get('/health').set('Origin', 'https://thirrem-rider.vercel.app');
    const blocked = await http().get('/health').set('Origin', 'https://evil.example.com');

    const preview = await http().get('/health').set('Origin', 'https://thirrem-rider-git-feature-x.vercel.app');

    expect(preview.headers['access-control-allow-origin']).toBe('https://thirrem-rider-git-feature-x.vercel.app');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://thirrem-rider.vercel.app');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Configuration', () => {
  it('refuses to start in production without DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
  });

  it('allows only the configured CORS origins in production, and adds localhost in development', () => {
    const production = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', CORS_ORIGINS: 'https://a.vercel.app, https://b.vercel.app' });
    expect(production.corsOrigins).toEqual(['https://a.vercel.app', 'https://b.vercel.app']);
    expect(loadConfig({}).corsOrigins).toContain('http://localhost:5002');
  });
});
