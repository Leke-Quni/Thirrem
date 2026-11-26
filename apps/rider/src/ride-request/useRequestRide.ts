import type { Coordinate, RideRequest, VehicleType } from '@thirrem/types';
import { useEffect } from 'react';
import { pinName } from '../map/pin-text';
import { fetchStreet } from '../map/street-api';
import { useHeldSend } from '../payment/useHeldSend';
import { requestRide } from './ride-request-api';

/** A Ride is not kept waiting long for a street name. */
const NAME_WITHIN_MS = 3_000;

type Pin = Coordinate & { label?: string };

async function nameOf(point: Pin) {
  const street = point.label ? null : await fetchStreet(point, AbortSignal.timeout(NAME_WITHIN_MS)).catch(() => null);
  return pinName(point, street);
}

/** Asking for a Ride. The error is cleared once the Rider changes what they would be asking for. */
export function useRequestRide(pickup: Pin | null, dropoff: Pin | null, vehicleType: VehicleType, onRequested: (rideRequest: RideRequest) => void) {
  const { pending, verifying, error, run, clearError } = useHeldSend();

  useEffect(clearError, [pickup, dropoff, vehicleType]);

  const request = () => {
    if (!pickup || !dropoff) return;
    let names: Promise<[string | undefined, string | undefined]> | undefined;
    run(
      async (holdId) => {
        const [pickupName, dropoffName] = await (names ??= Promise.all([nameOf(pickup), nameOf(dropoff)]));
        return requestRide(pickup, dropoff, vehicleType, { pickupName, dropoffName }, holdId);
      },
      onRequested,
      'Your Ride could not be requested. Please try again.',
    );
  };
  return { pending, verifying, error, request };
}
