import type { Coordinate, RideRequest, VehicleType } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';

export async function requestRide(pickup: Coordinate, dropoff: Coordinate, vehicleType: VehicleType): Promise<RideRequest> {
  const response = await fetch(`${API_BASE_URL}/rider/ride-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: JSON.stringify({ pickup: { lat: pickup.lat, lon: pickup.lon }, dropoff: { lat: dropoff.lat, lon: dropoff.lon }, vehicleType }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'Your Ride could not be requested. Please try again.', response.status);
  return body as RideRequest;
}

/** Looks for the matched Driver's route again, after none could be found. */
export async function findRouteAgain(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rider/ride-requests/approach`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  throw new ApiError(body.message ?? 'The route could not be asked for. Please try again.', response.status);
}
