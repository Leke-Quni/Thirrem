import { ApiError } from './auth-api';

export function shouldEndSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
