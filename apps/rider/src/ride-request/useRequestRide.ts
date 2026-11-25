import type { Coordinate, RideRequest, VehicleType } from '@thirrem/types';
import { useEffect, useState } from 'react';
import { requestRide } from './ride-request-api';

/** Asking for a Ride. The error is cleared once the Rider changes what they would be asking for. */
export function useRequestRide(pickup: Coordinate | null, dropoff: Coordinate | null, vehicleType: VehicleType, onRequested: (rideRequest: RideRequest) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [pickup, dropoff, vehicleType]);

  const request = () => {
    if (!pickup || !dropoff || pending) return;
    setPending(true);
    setError(null);
    requestRide(pickup, dropoff, vehicleType)
      .then(onRequested)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Your Ride could not be requested. Please try again.'))
      .finally(() => setPending(false));
  };
  return { pending, error, request };
}
