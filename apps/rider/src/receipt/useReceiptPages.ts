import type { ReceiptsResponse } from '@thirrem/types';
import { useCallback, useRef, useState } from 'react';
import { receiptApi } from './receipt-api';
import { useLoaded } from './useLoaded';

/** The Rider's receipts, a page at a time. `loadMore` adds the next one, and `moreError` says why it could not. */
export function useReceiptPages(enabled: boolean) {
  const first = useLoaded(() => receiptApi.list(), enabled);
  const [later, setLater] = useState<ReceiptsResponse[]>([]);
  const [moreError, setMoreError] = useState<string | null>(null);
  const loading = useRef(false);

  const pages = first.state.status === 'ready' ? [first.state.value, ...later] : [];
  const newest = pages.at(-1);
  const next = newest?.next ?? null;

  const loadMore = useCallback(() => {
    if (!next || loading.current) return;
    loading.current = true;
    setMoreError(null);
    receiptApi
      .list(next)
      .then(
        (page) => setLater((before) => [...before, page]),
        (failure: unknown) => setMoreError(failure instanceof Error ? failure.message : 'Your receipts could not be loaded.'),
      )
      .finally(() => (loading.current = false));
  }, [next]);

  const receipts = pages.flatMap((page) => page.receipts);
  const remaining = next ? Math.max(0, newest!.total - receipts.length) : 0;

  return { state: first.state, retry: first.retry, receipts, next, remaining, loadMore, moreError };
}
