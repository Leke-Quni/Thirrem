import { ApiError } from '@thirrem/ui';
import type { DriverVehicleResponse, VehicleOptionsResponse, VehicleType } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { TOKEN_KEY } from '../auth/AuthProvider';

export interface VehicleChoice {
  vehicleType: VehicleType;
  model: string;
  colour: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/driver${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? 'Something went wrong. Please try again.', response.status);
  return body as T;
}

export const vehicleApi = {
  read: () => request<DriverVehicleResponse>('/vehicle'),
  options: () => request<VehicleOptionsResponse>('/vehicle-options'),
  register: (choice: VehicleChoice) => request<DriverVehicleResponse>('/vehicle', { method: 'POST', body: JSON.stringify(choice) }),
};
