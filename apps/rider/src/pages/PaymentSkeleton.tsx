import { RiderBar } from '../components/RiderBar';
import { TestCards } from '../payment/TestCards';

export function MethodsSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading your payment methods…
      </span>
      <div className="methods-skeleton" aria-hidden="true">
        <span className="skeleton-field" />
        <span className="skeleton-field" />
      </div>
    </>
  );
}

export function PaymentSkeleton() {
  return (
    <div className="ride-page" aria-busy="true">
      <RiderBar />
      <main className="payment-layout">
        <header className="payment-head">
          <h1>Payment</h1>
          <p className="payment-lead">Test mode. No real money is taken.</p>
        </header>
        <section className="payment-panel">
          <h2>Saved methods</h2>
          <MethodsSkeleton />
        </section>
        <TestCards />
      </main>
    </div>
  );
}
