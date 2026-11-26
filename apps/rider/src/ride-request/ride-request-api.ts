import type { Coordinate, PaymentRefusedResponse, RideRequest, VehicleType } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { PaymentRefusedError } from '../payment/payment-refusal';

/** Why the API would not do what was asked, going by its answer. */
function refusal(response: Response, body: { message?: string; code?: string }, fallback: string): ApiError {
  if (response.status === 402 && body.code) return new PaymentRefusedError(body as PaymentRefusedResponse);
  return new ApiError(body.message ?? fallback, response.status);
}

/** What the pins are called, for the Rider's payment records. */
export interface PointNames {
  pickupName?: string;
  dropoffName?: string;
}

/** `holdId` is that of a hold the Rider's bank has been asked to verify. */
export async function requestRide(pickup: Coordinate, dropoff: Coordinate, vehicleType: VehicleType, names: PointNames, holdId?: string): Promise<RideRequest> {
  const response = await fetch(`${API_BASE_URL}/rider/ride-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: JSON.stringify({ pickup: { lat: pickup.lat, lon: pickup.lon }, dropoff: { lat: dropoff.lat, lon: dropoff.lon }, vehicleType, ...names, holdId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw refusal(response, body, 'Your Ride could not be requested. Please try again.');
  return body as RideRequest;
}

export type DriveTo = 'pickup' | 'dropoff';

const ROUTE_PATHS: Record<DriveTo, string> = { pickup: '/rider/ride-requests/approach', dropoff: '/rider/rides/route' };

/** Looks for the route to the Pickup Point or the Drop-off Point again, after none could be found. */
export async function findRouteAgain(to: DriveTo, holdId?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${ROUTE_PATHS[to]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: JSON.stringify({ holdId }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  throw refusal(response, body, 'The route could not be asked for. Please try again.');
}

/** The API refused a cancel that would pause Ride Requests, as the pause had not been agreed to. */
export class CancelWouldPauseError extends ApiError {}

export async function cancelRideRequest(pauseAccepted: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rider/ride-requests${pauseAccepted ? '?pause=accepted' : ''}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const Failure = body.code === 'CANCEL_WOULD_PAUSE' ? CancelWouldPauseError : ApiError;
  throw new Failure(body.message ?? 'Your Ride Request could not be cancelled. Please try again.', response.status);
}

/** Asks the Driver to stop and end the Ride early. */
export async function endRide(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rider/rides/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  throw new ApiError(body.message ?? 'Your Driver could not be asked to stop. Please try again.', response.status);
}
