import type { RideRequest } from '@thirrem/types';
import { describe, expect, it } from 'vitest';
import { cancelQuestion } from './cancel-text';

const matched = (approach: RideRequest['approach']) => ({ approach, driver: { name: 'Arta K.' } }) as RideRequest;

describe('cancelQuestion', () => {
  it('says how far off the Driver is', () => {
    expect(cancelQuestion(matched({ status: 'driving', geometry: [], etaS: 240 }), false)).toBe('Arta K. is 4 min away. Cancel anyway?');
  });
  it('says when the Driver is waiting', () => {
    expect(cancelQuestion(matched({ status: 'arrived' }), false)).toBe('Arta K. is waiting for you. Cancel anyway?');
  });
  it.each(['routing', 'unavailable'] as const)('says the Driver is on the way while the time is not known: %s', (status) => {
    expect(cancelQuestion(matched({ status }), false)).toBe('Arta K. is on the way. Cancel anyway?');
  });
  it('asks plainly while the Driver is not known yet', () => {
    expect(cancelQuestion({ approach: null, driver: null } as RideRequest, false)).toBe('Cancel your Ride Request?');
  });
  it('says only that cancelling locks the Rider out, when it would', () => {
    expect(cancelQuestion(matched({ status: 'arrived' }), true)).toBe('Cancelling locks you for 15 minutes.');
  });
});
