import type { Coordinate, SandboxResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';

/** A `fresh` Sandbox replaces the one the Rider has, instead of resuming it. */
export async function openSandbox(centre: Coordinate, fresh: boolean, signal: AbortSignal): Promise<SandboxResponse> {
  const response = await fetch(`${API_BASE_URL}/rider/sandbox`, {
    method: 'PUT',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: JSON.stringify({ centre: { lat: centre.lat, lon: centre.lon }, ...(fresh && { fresh }) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'The Drivers could not be placed. Please try again.', response.status);
  return body as SandboxResponse;
}
