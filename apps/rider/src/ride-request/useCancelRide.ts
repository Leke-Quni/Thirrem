import { useState } from 'react';
import { CancelWouldPauseError, cancelRideRequest } from './ride-request-api';

/** Cancelling the Ride Request. `wouldPause` is set when the API refused because the pause had not been agreed to. */
export function useCancelRide(onCancelled: (paused: boolean) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wouldPause, setWouldPause] = useState(false);

  const cancel = (pauseAccepted: boolean) => {
    if (pending) return;
    setPending(true);
    setError(null);
    cancelRideRequest(pauseAccepted)
      .then(() => onCancelled(pauseAccepted))
      .catch((failure: unknown) => {
        if (failure instanceof CancelWouldPauseError) setWouldPause(true);
        else setError(failure instanceof Error ? failure.message : 'Your Ride Request could not be cancelled. Please try again.');
      })
      .finally(() => setPending(false));
  };
  return { pending, error, wouldPause, cancel };
}
