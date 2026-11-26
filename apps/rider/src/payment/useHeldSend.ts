import { useState } from 'react';
import { bankCheck } from './bank-check';
import { type RequestFailure, requestFailure, withBankVerification } from './payment-refusal';

/** Sending what needs the Fare held, one at a time, with the Rider's bank checking them if it asks to. */
export function useHeldSend() {
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<RequestFailure | null>(null);

  const run = <T,>(send: (holdId?: string) => Promise<T>, onSent: (answer: T) => void, fallback: string) => {
    if (pending) return;
    setPending(true);
    setError(null);
    withBankVerification(send, (publishableKey, clientSecret) => {
      setVerifying(true);
      return bankCheck(publishableKey, clientSecret);
    })
      .then(onSent)
      .catch((failure: unknown) => setError(requestFailure(failure, fallback)))
      .finally(() => {
        setPending(false);
        setVerifying(false);
      });
  };

  const clearError = () => setError(null);

  return { pending, verifying, error, run, clearError };
}
