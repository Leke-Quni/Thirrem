import type { MeResponse, SessionResponse } from '@thirrem/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'Something went wrong. Please try again.', response.status);
  return body as T;
}

export const authApi = {
  signup: (email: string, password: string) =>
    request<SessionResponse>('/rider/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<SessionResponse>('/rider/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<MeResponse>('/rider/me', { headers: { Authorization: `Bearer ${token}` } }),
};
