import { Icon } from '../components/Icon';

export function LoadFailure({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <>
      <p className="form-error" role="alert">
        <Icon name="alert" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <div className="payment-buttons">
          <button type="button" className="btn primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
