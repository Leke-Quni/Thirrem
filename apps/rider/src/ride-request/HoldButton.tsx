import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';

const HOLD_MS = 1_500;

const isHoldKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

interface HoldButtonProps {
  label: string;
  pending: boolean;
  onHeld(): void;
}

/**
 * A button that acts only once held down, by pointer, Enter or Space, so that it is not pressed by mistake.
 * Assistive technology sends a click without holding anything, which acts at once, so this must only follow a question already asked.
 */
export function HoldButton({ label, pending, onHeld }: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  const start = () => {
    if (pending) return;
    stop();
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onHeld();
    }, HOLD_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={`btn ghost hold-button${holding ? ' is-holding' : ''}`}
      style={{ '--hold-ms': `${HOLD_MS}ms` } as CSSProperties}
      aria-disabled={pending}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // A touch otherwise stays with this button however far the finger slides.
        event.currentTarget.releasePointerCapture(event.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={(event) => {
        if (!isHoldKey(event)) return;
        // Also keeps the key from clicking the button.
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        stop();
      }}
      // Only a click no pointer made has a detail of 0.
      onClick={(event) => {
        if (event.detail === 0 && !pending) onHeld();
      }}
      // A long press would otherwise open the browser's menu.
      onContextMenu={(event) => event.preventDefault()}
    >
      {pending && <span className="spinner small" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
