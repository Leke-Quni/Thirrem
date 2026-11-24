import type { Coordinate, RouteResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';

export async function fetchRoute(pickup: Coordinate, dropoff: Coordinate, signal: AbortSignal): Promise<RouteResponse> {
  const response = await fetch(`${API_BASE_URL}/rider/route`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: JSON.stringify({ pickup: { lat: pickup.lat, lon: pickup.lon }, dropoff: { lat: dropoff.lat, lon: dropoff.lon } }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'The route could not be loaded. Please try again.', response.status);
  return body as RouteResponse;
}
