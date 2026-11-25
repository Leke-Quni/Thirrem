import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import { openSandbox } from './sandbox-api';
import { movedAway } from './sandbox-centre';

export type SandboxState =
  | { status: 'loading' }
  | { status: 'ready'; drivers: SimulatedDriver[] }
  | { status: 'error'; message: string };

export function useSandbox(centre: Coordinate | null): { state: SandboxState; retry(): void } {
  const [placedAt, setPlacedAt] = useState<Coordinate | null>(null);
  const [state, setState] = useState<SandboxState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (centre && (!placedAt || movedAway(placedAt, centre))) setPlacedAt(centre);
  }, [centre, placedAt]);

  useEffect(() => {
    if (!placedAt) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    openSandbox(placedAt, controller.signal)
      .then(({ drivers }) => setState({ status: 'ready', drivers }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The Drivers could not be placed. Please try again.' });
      });
    return () => controller.abort();
  }, [placedAt, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
