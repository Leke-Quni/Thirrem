import { ApiError, shouldEndSession } from '@thirrem/ui';
import type { DriverVehicle, VehicleOptionsResponse } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { type VehicleChoice, vehicleApi } from './vehicle-api';

const POLL_MS = 1000;

export type VehicleState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'unregistered'; options: VehicleOptionsResponse }
  | { status: 'registered'; vehicle: DriverVehicle };

export function useVehicle() {
  const { retry: recheckSession } = useAuth();
  const [state, setState] = useState<VehicleState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    Promise.all([vehicleApi.read(), vehicleApi.options()])
      .then(([{ vehicle }, options]) => {
        if (current) setState(vehicle ? { status: 'registered', vehicle } : { status: 'unregistered', options });
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (shouldEndSession(error)) recheckSession();
        else setState({ status: 'failed' });
      });
    return () => {
      current = false;
    };
  }, [attempt, recheckSession]);

  const pending = state.status === 'registered' && state.vehicle.status === 'pending';

  useEffect(() => {
    if (!pending) return;
    let current = true;
    let timer: number;
    // A failed check is tried again; the page keeps showing the last answer.
    const check = async () => {
      try {
        const { vehicle } = await vehicleApi.read();
        if (current && vehicle) setState({ status: 'registered', vehicle });
      } catch (error) {
        if (current && shouldEndSession(error)) recheckSession();
      }
      if (current) timer = window.setTimeout(check, POLL_MS);
    };
    timer = window.setTimeout(check, POLL_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [pending, recheckSession]);

  /** Rejects with the message to show when the vehicle was not registered. */
  const register = useCallback(
    async (choice: VehicleChoice) => {
      try {
        const { vehicle } = await vehicleApi.register(choice);
        if (vehicle) setState({ status: 'registered', vehicle });
      } catch (error) {
        if (shouldEndSession(error)) return recheckSession();
        // Already registered elsewhere, so show that vehicle.
        if (error instanceof ApiError && error.status === 409) return setAttempt((n) => n + 1);
        if (error instanceof ApiError) throw error;
        throw new Error('Could not reach Thirrem. Check your connection and try again.');
      }
    },
    [recheckSession],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, register, reload };
}
