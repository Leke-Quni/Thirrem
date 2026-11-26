import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../auth/auth-api';

export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'failed'; message: string; missing: boolean };

/** What `load` gives, asked for once `enabled` and again whenever `key` changes. */
export function useLoaded<T>(load: () => Promise<T>, enabled: boolean, key = '') {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ status: 'loading' });
    load().then(
      (value) => current && setState({ status: 'ready', value }),
      (failure: unknown) =>
        current && setState({ status: 'failed', message: failure instanceof Error ? failure.message : 'That could not be loaded.', missing: failure instanceof ApiError && failure.status === 404 }),
    );
    return () => {
      current = false;
    };
  }, [enabled, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
