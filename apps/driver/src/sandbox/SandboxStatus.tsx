import { RouteLoader } from '@thirrem/ui';
import type { SandboxState } from './useDriverSandbox';

/** What is said over the map about the Sandbox. */
export function SandboxStatus({ sandbox, onRetry }: { sandbox: SandboxState; onRetry(): void }) {
  const connection = sandbox.status === 'ready' ? sandbox.connection : null;
  const stopped = connection === 'stopped' || connection === 'resuming';
  const resuming = connection === 'resuming';

  return (
    <>
      {/* Always present, so that what appears in it is read out. */}
      <div className={sandbox.status === 'loading' ? 'map-loading' : 'map-status'} role="status">
        {sandbox.status === 'loading' && <RouteLoader label="Placing your car…" />}
        {connection === 'running' && 'Your car is on the map'}
        {stopped && 'Your Sandbox stopped after 15 minutes without activity.'}
      </div>
      {stopped && (
        // Not `disabled` while resuming, which would take focus away from it.
        <button type="button" className="btn primary map-action" aria-disabled={resuming} onClick={resuming ? undefined : onRetry}>
          {resuming && <span className="spinner small" aria-hidden="true" />}
          {resuming ? 'Resuming…' : 'Resume Sandbox'}
        </button>
      )}
      {sandbox.status === 'busy' && (
        <div className="map-notice" role="alert">
          <h2>All Sandboxes are busy</h2>
          <p>Your car cannot be shown until one is free. Try again in a few minutes.</p>
          <button type="button" className="btn primary" aria-disabled={sandbox.retrying} onClick={sandbox.retrying ? undefined : onRetry}>
            {sandbox.retrying && <span className="spinner small" aria-hidden="true" />}
            {sandbox.retrying ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}
      {sandbox.status === 'error' && (
        <div className="map-notice" role="alert">
          <h2>Sandbox unavailable</h2>
          <p>{sandbox.message}</p>
          <button type="button" className="btn primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
