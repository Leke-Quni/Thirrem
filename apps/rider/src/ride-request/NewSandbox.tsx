import { useEffect, useRef, useState } from 'react';

interface NewSandboxProps {
  /** What the Rider loses by starting one, such as "your Ride". */
  drops: string;
  onStartNew(): void;
}

/** Starting a new Sandbox, once the Rider has confirmed it. */
export function NewSandbox({ drops, onStartNew }: NewSandboxProps) {
  const [confirming, setConfirming] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (asked.current) start.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  return confirming ? (
    <div className="request-reset" role="group" aria-labelledby="reset-question">
      <p id="reset-question">Start a new Sandbox? This drops {drops} and places new Drivers.</p>
      <div className="reset-actions">
        <button type="button" className="btn primary" onClick={onStartNew}>
          Start new
        </button>
        <button type="button" className="btn ghost" ref={keep} onClick={() => setConfirming(false)}>
          Keep this one
        </button>
      </div>
    </div>
  ) : (
    <div className="request-reset">
      <button type="button" className="btn ghost" ref={start} onClick={() => setConfirming(true)}>
        Start a new Sandbox
      </button>
    </div>
  );
}
