import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/app-config.js';

const keys = { STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' };

describe('Stripe configuration', () => {
  it('leaves payments off when no key is set', () => {
    expect(loadConfig({}).stripe).toBeNull();
    expect(loadConfig({ STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '' }).stripe).toBeNull();
  });

  it('takes both keys from the environment', () => {
    expect(loadConfig(keys).stripe).toEqual({ secretKey: 'sk_test_abc', publishableKey: 'pk_test_abc' });
    expect(loadConfig({ ...keys, STRIPE_SECRET_KEY: 'rk_test_abc' }).stripe?.secretKey).toBe('rk_test_abc');
  });

  it('leaves payments off when only one of the two keys is set', () => {
    expect(loadConfig({ STRIPE_SECRET_KEY: keys.STRIPE_SECRET_KEY }).stripe).toBeNull();
    expect(loadConfig({ STRIPE_PUBLISHABLE_KEY: keys.STRIPE_PUBLISHABLE_KEY }).stripe).toBeNull();
  });

  it('refuses to start with a live key, without repeating it', () => {
    for (const live of [{ STRIPE_SECRET_KEY: 'sk_live_secretvalue' }, { STRIPE_SECRET_KEY: 'rk_live_secretvalue' }, { STRIPE_PUBLISHABLE_KEY: 'pk_live_secretvalue' }]) {
      expect(() => loadConfig({ ...keys, ...live })).toThrow(/test mode/i);
      expect(() => loadConfig({ ...keys, ...live })).not.toThrow(/secretvalue/);
    }
  });
});
