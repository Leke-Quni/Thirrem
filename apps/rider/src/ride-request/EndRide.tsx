import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { endRide } from './ride-request-api';

interface EndRideProps {
  /** The Driver has been asked to stop. */
  onAsked(): void;
}

/** Asking the Driver to end the Ride early, once the Rider has confirmed it. */
export function EndRide({ onAsked }: EndRideProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (asked.current) start.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  const ask = () => {
    if (pending) return;
    setPending(true);
    setError(null);
    endRide()
      .then(onAsked)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Your Driver could not be asked to stop. Please try again.'))
      .finally(() => setPending(false));
  };

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setConfirming(false);
  };

  return confirming ? (
    <div className="end-ride" role="group" aria-labelledby="end-question" aria-describedby="end-cost" onKeyDown={closeOnEscape}>
      <p id="end-question" className="reset-question">
        Ask your Driver to stop?
      </p>
      <p id="end-cost" className="cancel-cost">
        You’ll pay for the distance travelled until you stop.
      </p>
      {/* Side by side, with the safe choice first, so that one is not pressed for the other. */}
      <div className="confirm-actions">
        <button type="button" className="btn primary" ref={keep} onClick={() => setConfirming(false)}>
          Keep riding
        </button>
        <button type="button" className="btn ghost" aria-disabled={pending} onClick={ask}>
          {pending && <span className="spinner small" aria-hidden="true" />}
          {pending ? 'Asking…' : 'Ask to stop'}
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          <span>{error}</span>
        </div>
      )}
    </div>
  ) : (
    <div className="end-ride">
      <button type="button" className="btn ghost" ref={start} onClick={() => setConfirming(true)}>
        End Ride early
      </button>
    </div>
  );
}
