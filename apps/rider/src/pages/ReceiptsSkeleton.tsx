import { Link } from 'react-router-dom';
import { RiderBar } from '../components/RiderBar';
import { expectedReceipts } from '../receipt/receipt-count';
import { ReceiptShells } from '../receipt/ReceiptShells';

export function ReceiptsLoader() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading your receipts…
      </span>
      <ReceiptShells count={expectedReceipts()} />
    </>
  );
}

export function ReceiptLoader() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading your receipt…
      </span>
      <div className="payment-panel receipt-skeleton" aria-hidden="true">
        <span className="skeleton-line wide" />
        <span className="skeleton-block" />
        <span className="skeleton-block tall" />
      </div>
    </>
  );
}

export function ReceiptsHead() {
  return (
    <header>
      <h1>Receipts</h1>
      <p className="payment-lead">Test mode. No real money is taken.</p>
    </header>
  );
}

export function ReceiptHead() {
  return (
    <header>
      <Link className="receipts-back" to="/receipts">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        All receipts
      </Link>
      <h1>Receipt</h1>
    </header>
  );
}

export function ReceiptsSkeleton() {
  return (
    <div className="ride-page" aria-busy="true">
      <RiderBar />
      <main className="receipts-layout">
        <ReceiptsHead />
        <ReceiptsLoader />
      </main>
    </div>
  );
}

export function ReceiptSkeleton() {
  return (
    <div className="ride-page" aria-busy="true">
      <RiderBar />
      <main className="receipts-layout">
        <ReceiptHead />
        <ReceiptLoader />
      </main>
    </div>
  );
}
