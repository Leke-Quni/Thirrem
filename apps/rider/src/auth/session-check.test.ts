import { describe, expect, it } from 'vitest';
import { ApiError } from './auth-api';
import { shouldEndSession } from './session-check';

describe('shouldEndSession', () => {
  it('ends the session when the server says the token is not valid', () => {
    expect(shouldEndSession(new ApiError('Unauthorized', 401))).toBe(true);
  });

  it('keeps the session when the server is having a problem', () => {
    expect(shouldEndSession(new ApiError('Bad gateway', 502))).toBe(false);
    expect(shouldEndSession(new ApiError('Unavailable', 503))).toBe(false);
  });

  it('keeps the session when the request fails on the network, as it does when a reload cancels it', () => {
    expect(shouldEndSession(new TypeError('Failed to fetch'))).toBe(false);
    expect(shouldEndSession(new DOMException('The operation was aborted.', 'AbortError'))).toBe(false);
  });

  it('keeps the session for any other failure, because only a 401 proves the token is bad', () => {
    expect(shouldEndSession(new ApiError('Forbidden', 403))).toBe(false);
    expect(shouldEndSession(new Error('anything'))).toBe(false);
    expect(shouldEndSession(undefined)).toBe(false);
  });
});
