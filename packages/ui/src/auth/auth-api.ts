import type { MeResponse, SessionResponse } from '@thirrem/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type AppName = 'rider' | 'driver';

export function createAuthApi(app: AppName, apiBaseUrl: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}/${app}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.message ?? 'Something went wrong. Please try again.', response.status);
    return body as T;
  }

  return {
    signup: (email: string, password: string) =>
      request<SessionResponse>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
    login: (email: string, password: string) =>
      request<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: (token: string) => request<MeResponse>('/me', { headers: { Authorization: `Bearer ${token}` } }),
  };
}
