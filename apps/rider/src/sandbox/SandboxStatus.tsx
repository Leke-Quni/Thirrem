import type { SandboxState } from './useSandbox';

export function SandboxStatus({ sandbox, onRetry }: { sandbox: SandboxState; onRetry(): void }) {
  return (
    <>
      <p className="map-status" role="status">
        {sandbox.status === 'loading' && 'Placing Drivers…'}
        {sandbox.status === 'ready' && `${sandbox.drivers.length} simulated Drivers nearby`}
      </p>
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
