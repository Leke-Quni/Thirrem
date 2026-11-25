import { useEffect, useRef } from 'react';

interface SandboxTimeoutDialogProps {
  /** The stopped Sandbox is no longer there, so it cannot be continued. */
  discarded: boolean;
  onContinue(): void;
  onStartNew(): void;
  onClose(): void;
}

export function SandboxTimeoutDialog({ discarded, onContinue, onStartNew, onClose }: SandboxTimeoutDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  // A modal dialog keeps focus inside, closes with Escape and makes the rest of the page inert.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="timeout-dialog" aria-labelledby="timeout-title" aria-describedby="timeout-text" onClose={onClose}>
      <h2 id="timeout-title">Your Sandbox timed out</h2>
      <p id="timeout-text">{discarded ? 'It is no longer available. Start a new one to see Drivers again.' : 'It stopped after 15 minutes without activity.'}</p>
      <div className="timeout-actions">
        {!discarded && (
          <button type="button" className="btn primary" onClick={onContinue}>
            Continue
          </button>
        )}
        <button type="button" className={`btn ${discarded ? 'primary' : 'ghost'}`} onClick={onStartNew}>
          Start a new one
        </button>
      </div>
      {/* Last, so that opening the dialog focuses the main choice. */}
      <button type="button" className="icon-btn timeout-close" aria-label="Close" onClick={() => dialog.current?.close()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </dialog>
  );
}
