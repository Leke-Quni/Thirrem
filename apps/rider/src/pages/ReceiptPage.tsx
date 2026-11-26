import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { RiderPage } from '../components/RiderPage';
import { LoadFailure } from '../receipt/LoadFailure';
import { receiptApi } from '../receipt/receipt-api';
import { ReceiptDetails } from '../receipt/ReceiptDetails';
import { useLoaded } from '../receipt/useLoaded';
import { ReceiptHead, ReceiptLoader, ReceiptSkeleton } from './ReceiptsSkeleton';

export function ReceiptPage() {
  const { email } = useAuth();
  const { id = '' } = useParams();
  const { state, retry } = useLoaded(() => receiptApi.find(id), Boolean(email), id);

  return (
    <RiderPage title="Receipt" skeleton={<ReceiptSkeleton />}>
      <main className="receipts-layout">
        <ReceiptHead />
        {state.status === 'loading' && <ReceiptLoader />}
        {state.status === 'failed' && (
          <div className="payment-panel">
            <LoadFailure message={state.message} onRetry={state.missing ? undefined : retry} />
          </div>
        )}
        {state.status === 'ready' && <ReceiptDetails receipt={state.value} />}
      </main>
    </RiderPage>
  );
}
