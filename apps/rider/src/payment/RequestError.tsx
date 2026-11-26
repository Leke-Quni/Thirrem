import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { paymentApi } from './payment-api';
import type { RequestFailure } from './payment-refusal';

/** Why a request failed. Where the payment method is the reason, it offers the ways to put that right. */
export function RequestError({ failure }: { failure: RequestFailure | null }) {
  if (!failure) return null;
  if (failure.payment) return <PaymentProblem key={failure.message} failure={failure} />;
  return (
    <div className="form-error" role="alert">
      <span>{failure.message}</span>
    </div>
  );
}

function PaymentProblem({ failure }: { failure: RequestFailure }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef<HTMLParagraphElement>(null);
  const missing = failure.payment === 'PAYMENT_METHOD_REQUIRED';

  // The button pressed has gone, so focus is moved to what took its place.
  useEffect(() => {
    if (added) done.current?.focus();
  }, [added]);

  const addTestCard = () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    paymentApi
      .addTestCard()
      .then(() => setAdded(true))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The test card could not be added. Try again.'))
      .finally(() => setAdding(false));
  };

  if (added) {
    return (
      <p className="payment-added" ref={done} role="status" tabIndex={-1}>
        Test card saved. Try again now.
      </p>
    );
  }
  return (
    <div className="payment-problem">
      <div className="form-error" role="alert">
        <span>{failure.message}</span>
      </div>
      <div className="reset-actions">
        {missing && (
          <button type="button" className="btn ghost" aria-disabled={adding} onClick={addTestCard}>
            {adding && <span className="spinner small" aria-hidden="true" />}
            {adding ? 'Adding…' : 'Use a test card'}
          </button>
        )}
        <Link className="btn ghost" to="/payment">
          {missing ? 'Add a card' : 'Change payment method'}
        </Link>
      </div>
      {error && (
        <div className="form-error" role="alert">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
