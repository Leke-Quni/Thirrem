import { ApiError } from '@thirrem/ui';
import type { Coordinate, DriverSandboxResponse, SandboxBusyResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';

/** As many Sandboxes as are allowed are already running. */
export class SandboxBusyError extends Error {}

async function request(init: RequestInit): Promise<DriverSandboxResponse> {
  const response = await fetch(`${API_BASE_URL}/driver/sandbox`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  });
  const body = await response.json().catch(() => ({}));
  // Told apart by its code, as a server that cannot be reached answers 503 too.
  if ((body as Partial<SandboxBusyResponse>).code === 'SANDBOX_LIMIT') throw new SandboxBusyError();
  if (!response.ok) throw new ApiError(body.message ?? 'Your Sandbox could not be opened. Please try again.', response.status);
  return body as DriverSandboxResponse;
}

export const sandboxApi = {
  open: ({ lat, lon }: Coordinate, signal: AbortSignal) => request({ method: 'PUT', signal, body: JSON.stringify({ centre: { lat, lon } }) }),
  read: (signal: AbortSignal) => request({ signal }),
};
