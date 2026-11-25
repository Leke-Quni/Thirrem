import { useEffect, useState } from 'react';

const SHOWN_FOR_MS = 8_000;

interface CancelWarningToastProps {
  shown: boolean;
  onClose(): void;
}

/** Closes by itself, though not while the Rider is pointing at it or has focus on it, and starts its time again once they leave. */
export function CancelWarningToast({ shown, onClose }: CancelWarningToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const attended = hovered || focused;

  useEffect(() => {
    if (!shown) {
      // A toast that goes while attended to sends no event to say it was left.
      setHovered(false);
      setFocused(false);
      return;
    }
    if (attended) return;
    const timer = setTimeout(onClose, SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [shown, attended, onClose]);

  return (
    // Always there, as screen readers only announce what is added to a region they already know of.
    <div className="toast-region" role="status">
      {shown && (
        <div className="toast" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          <p>If you keep cancelling your Ride Requests, you’ll be locked from requesting for a while.</p>
          <button type="button" className="icon-btn toast-close" aria-label="Close message" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
