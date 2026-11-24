import type { Coordinate, StreetResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';

export async function fetchStreet(point: Coordinate, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
  const response = await fetch(`${API_BASE_URL}/rider/places/reverse?${params}`, {
    signal,
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  if (!response.ok) return null;
  return ((await response.json()) as StreetResponse).street ?? null;
}
