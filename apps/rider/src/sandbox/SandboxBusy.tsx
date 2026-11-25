interface SandboxBusyProps {
  retrying: boolean;
  onRetry(): void;
}

export function SandboxBusy({ retrying, onRetry }: SandboxBusyProps) {
  return (
    <div className="sandbox-busy" role="alert">
      <h2>All Sandboxes are busy</h2>
      <p>No Drivers can be shown until one is free. Try again in a few minutes. You can still plan your ride.</p>
      {/* Not `disabled` while retrying, which would take focus away from it. */}
      <button type="button" className="btn primary" aria-disabled={retrying} onClick={retrying ? undefined : onRetry}>
        {retrying && <span className="spinner small" aria-hidden="true" />}
        {retrying ? 'Trying…' : 'Try again'}
      </button>
    </div>
  );
}
