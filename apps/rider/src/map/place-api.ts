import type { Coordinate, PlaceResult } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';

export async function searchPlaces(query: string, near: Coordinate | null, signal: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lon));
  }
  const response = await fetch(`${API_BASE_URL}/rider/places?${params}`, {
    signal,
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'Search is unavailable right now. Click the map to place a pin instead.', response.status);
  return body as PlaceResult[];
}
