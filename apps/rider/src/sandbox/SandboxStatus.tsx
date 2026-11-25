import { useEffect, useState } from 'react';
import { SandboxBusy } from './SandboxBusy';
import { SandboxTimeoutDialog } from './SandboxTimeoutDialog';
import { hasTimedOut, type SandboxState } from './useSandbox';

interface SandboxStatusProps {
  sandbox: SandboxState;
  onRetry(): void;
  onStartNew(): void;
}

export function SandboxStatus({ sandbox, onRetry, onStartNew }: SandboxStatusProps) {
  const timedOut = hasTimedOut(sandbox);
  const connection = sandbox.status === 'ready' ? sandbox.connection : null;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!timedOut) setDismissed(false);
  }, [timedOut]);

  return (
    <>
      <p className="map-status" role="status">
        {sandbox.status === 'loading' && 'Placing Drivers…'}
        {sandbox.status === 'ready' && connection === 'live' && `${sandbox.drivers.length} simulated ${sandbox.drivers.length === 1 ? 'Driver' : 'Drivers'} nearby`}
        {connection === 'reconnecting' && 'Reconnecting to the Drivers…'}
        {connection === 'resuming' && 'Resuming the Sandbox…'}
        {timedOut && dismissed && (
          <>
            <span>{connection === 'discarded' ? 'Your Sandbox is no longer available.' : 'Sandbox stopped after 15 minutes without activity.'}</span>
            <button type="button" className="btn ghost retry" onClick={connection === 'discarded' ? onStartNew : onRetry}>
              {connection === 'discarded' ? 'Start a new one' : 'Resume Sandbox'}
            </button>
          </>
        )}
      </p>
      {timedOut && !dismissed && <SandboxTimeoutDialog discarded={connection === 'discarded'} onContinue={onRetry} onStartNew={onStartNew} onClose={() => setDismissed(true)} />}
      {sandbox.status === 'busy' && <SandboxBusy retrying={sandbox.retrying} onRetry={onRetry} />}
      {sandbox.status === 'error' && (
        <div className="map-status is-error" role="alert">
          <span>{sandbox.message}</span>
          <button type="button" className="btn ghost retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
