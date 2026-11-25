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

export type DriveTo = 'pickup' | 'dropoff';

const ROUTE_PATHS: Record<DriveTo, string> = { pickup: '/rider/ride-requests/approach', dropoff: '/rider/rides/route' };

/** Looks for the route to the Pickup Point or the Drop-off Point again, after none could be found. */
export async function findRouteAgain(to: DriveTo): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${ROUTE_PATHS[to]}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  throw new ApiError(body.message ?? 'The route could not be asked for. Please try again.', response.status);
}
