import type { PaymentMethodsResponse } from '@thirrem/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { paymentApi } from './payment-api';

export type PaymentMethodsState = { status: 'loading' } | { status: 'failed'; message: string } | ({ status: 'ready' } & PaymentMethodsResponse);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/** The Rider's saved methods, and the changes made to them one at a time. */
export function usePaymentMethods(enabled: boolean) {
  const [state, setState] = useState<PaymentMethodsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  /** Which change is on its way, if any. */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ status: 'loading' });
    paymentApi.list().then(
      (list) => current && setState({ status: 'ready', ...list }),
      (failure: unknown) => current && setState({ status: 'failed', message: messageOf(failure) }),
    );
    return () => {
      current = false;
    };
  }, [enabled, attempt]);

  /** Sends one request at a time. Resolves to its answer, or null if it failed or another is still on its way. */
  const run = useCallback(async <T,>(name: string, send: () => Promise<T>): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true;
    setPending(name);
    setError(null);
    try {
      return await send();
    } catch (failure) {
      setError(messageOf(failure));
      return null;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);

  /** Makes one change and shows the list it leaves. */
  const change = useCallback(
    async (name: string, send: () => Promise<PaymentMethodsResponse>) => {
      const list = await run(name, send);
      if (list) setState({ status: 'ready', ...list });
      return list;
    },
    [run],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, pending, error, run, change, retry };
}
