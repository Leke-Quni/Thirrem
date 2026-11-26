import { useAuth } from '../auth/AuthProvider';
import { RiderPage } from '../components/RiderPage';
import { LoadFailure } from '../receipt/LoadFailure';
import { MoreReceipts } from '../receipt/MoreReceipts';
import { PAGE_SIZE } from '../receipt/receipt-count';
import { ReceiptList } from '../receipt/ReceiptList';
import { useReceiptPages } from '../receipt/useReceiptPages';
import { ReceiptsHead, ReceiptsLoader, ReceiptsSkeleton } from './ReceiptsSkeleton';

export function Receipts() {
  const { email } = useAuth();
  const { state, retry, receipts, next, remaining, loadMore, moreError } = useReceiptPages(Boolean(email));

  return (
    <RiderPage title="Receipts" skeleton={<ReceiptsSkeleton />}>
      <main className="receipts-layout">
        <ReceiptsHead />
        {state.status === 'loading' && <ReceiptsLoader />}
        {state.status === 'failed' && (
          <div className="payment-panel">
            <LoadFailure message={state.message} onRetry={retry} />
          </div>
        )}
        {state.status === 'ready' && <ReceiptList receipts={receipts} />}
        {next && <MoreReceipts count={Math.min(remaining, PAGE_SIZE)} error={moreError} onLoad={loadMore} />}
      </main>
    </RiderPage>
  );
}
