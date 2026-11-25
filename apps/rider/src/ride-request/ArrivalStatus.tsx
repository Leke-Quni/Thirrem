import type { Approach } from '@thirrem/types';
import { useState } from 'react';
import { formatDuration } from '../map/format';
import { findRouteAgain } from './ride-request-api';

interface ArrivalStatusProps {
  approach: Approach;
  /** The API is looking for the route again. */
  onRouting(): void;
}

function text(approach: Approach) {
  switch (approach.status) {
    case 'routing':
      return (
        <>
          <span className="spinner small" aria-hidden="true" />
          <span>Finding your Driver’s route…</span>
        </>
      );
    case 'driving':
      return (
        <>
          <span>Arriving in</span> <strong>{formatDuration(approach.etaS)}</strong>
        </>
      );
    case 'arrived':
      return <span>Your Driver is waiting at your Pickup Point.</span>;
    case 'unavailable':
      return <span>There is no route to your Pickup Point yet, so your Driver is waiting. Find it again, or start a new Sandbox.</span>;
  }
}

/** When the matched Driver will reach the Pickup Point, or why that is not known. */
export function ArrivalStatus({ approach, onRouting }: ArrivalStatusProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = () => {
    if (pending) return;
    setPending(true);
    setError(null);
    findRouteAgain()
      .then(onRouting)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The route could not be asked for. Please try again.'))
      .finally(() => setPending(false));
  };

  return (
    <div className="arrival-block">
      <div className={`arrival is-${approach.status}`} role="status">
        {text(approach)}
      </div>
      {approach.status === 'unavailable' && (
        <>
          <button type="button" className="btn primary" aria-disabled={pending} onClick={retry}>
            {pending && <span className="spinner small" aria-hidden="true" />}
            Find the route again
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
