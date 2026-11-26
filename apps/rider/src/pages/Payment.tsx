import type { PaymentMethod, PaymentMethodsResponse } from '@thirrem/types';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../auth/auth-api';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { RiderBar } from '../components/RiderBar';
import { AddCard } from '../payment/AddCard';
import { paymentApi } from '../payment/payment-api';
import { cardEnding } from '../payment/payment-text';
import { SavedMethods } from '../payment/SavedMethods';
import { TestCards } from '../payment/TestCards';
import { UnpaidFares } from '../payment/UnpaidFares';
import { usePaymentMethods } from '../payment/usePaymentMethods';
import { useUnpaidFares } from '../payment/useUnpaidFares';
import { MethodsSkeleton, PaymentSkeleton } from './PaymentSkeleton';
import { SessionUnavailable } from './SessionUnavailable';

export function Payment() {
  const { email, loading, unreachable, expired, retry: retrySession, logout } = useAuth();
  const navigate = useNavigate();
  const loggingOut = useRef(false);
  const { state, pending, error, run, change, retry } = usePaymentMethods(Boolean(email));
  const unpaid = useUnpaidFares(Boolean(email));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const [params, setParams] = useSearchParams();
  // Present when a method that had to leave the page to be checked has come back.
  const returned = params.get('setup_intent');
  const ready = state.status === 'ready';
  const methods = state.status === 'ready' ? state.methods : [];

  useEffect(() => {
    const before = document.title;
    document.title = 'Payment | Thirrem';
    return () => {
      document.title = before;
    };
  }, []);

  const announceAdded = (list: PaymentMethodsResponse) => {
    const added = list.methods.find((method) => !methods.some((known) => known.id === method.id));
    if (added) setAnnouncement(`${cardEnding(added)} saved.`);
  };

  const save = async (setupId: string) => {
    let secondCopy = false;
    const list = await change('save', () =>
      paymentApi.finishAdding(setupId).catch((failure: unknown) => {
        secondCopy = failure instanceof ApiError && failure.status === 409;
        throw failure;
      }),
    );
    // A card already saved cannot be saved by trying again, so the form closes as it does when saved.
    if (!list && !secondCopy) return false;
    if (list) announceAdded(list);
    setClientSecret(null);
    savedHeading.current?.focus();
    return true;
  };

  useEffect(() => {
    if (!ready || !returned) return;
    setParams({}, { replace: true });
    void save(returned);
  }, [ready, returned]);

  const openCardForm = async () => {
    setAnnouncement('');
    const setup = await run('setup', paymentApi.startAdding);
    if (setup) setClientSecret(setup.clientSecret);
  };

  const addTestCard = async () => {
    setAnnouncement('');
    const list = await change('test', paymentApi.addTestCard);
    if (list) announceAdded(list);
  };

  const remove = async (method: PaymentMethod) => {
    const list = await change(`remove:${method.id}`, () => paymentApi.remove(method.id));
    if (!list) return false;
    setAnnouncement(`${cardEnding(method)} removed.`);
    savedHeading.current?.focus();
    return true;
  };

  const makeDefault = async (method: PaymentMethod) => {
    if (await change(`default:${method.id}`, () => paymentApi.makeDefault(method.id))) {
      setAnnouncement(`${cardEnding(method)} is now the default.`);
      savedHeading.current?.focus();
    }
  };

  if (loading) return <PaymentSkeleton />;
  if (unreachable) return <SessionUnavailable onRetry={retrySession} />;
  if (!email) return loggingOut.current ? null : <Navigate to={expired ? '/login' : '/'} replace />;

  return (
    <div className="ride-page">
      <RiderBar
        onLogOut={() => {
          loggingOut.current = true;
          logout();
          navigate('/');
        }}
      />
      <main className="payment-layout">
        <header className="payment-head">
          <h1>Payment</h1>
          <p className="payment-lead">Test mode. No real money is taken.</p>
        </header>
        <div className="payment-main">
          <UnpaidFares unpaid={unpaid} methods={state.status === 'ready' ? state.methods : null} />
          <section className="payment-panel" aria-labelledby="saved-methods">
            <h2 id="saved-methods" ref={savedHeading} tabIndex={-1}>
              Saved methods
            </h2>
            {state.status === 'loading' && <MethodsSkeleton />}
            {state.status === 'failed' && (
              <>
                <p className="form-error" role="alert">
                  <Icon name="alert" />
                  <span>{state.message}</span>
                </p>
                <div className="payment-buttons">
                  <button type="button" className="btn primary" onClick={retry}>
                    Try again
                  </button>
                </div>
              </>
            )}
            {state.status === 'ready' && (
              <>
                <SavedMethods methods={state.methods} pending={pending} onMakeDefault={makeDefault} onRemove={remove} />
                {error && (
                  <p className="form-error" role="alert">
                    <Icon name="alert" />
                    <span>{error}</span>
                  </p>
                )}
                {!state.publishableKey ? (
                  <p className="payment-note">Card payments are not set up on this server.</p>
                ) : clientSecret ? (
                  <AddCard publishableKey={state.publishableKey} clientSecret={clientSecret} onAccepted={save} onCancel={() => setClientSecret(null)} />
                ) : (
                  <div className="payment-add">
                    <div className="payment-buttons">
                      <button type="button" className="btn primary" aria-disabled={pending !== null} onClick={openCardForm}>
                        {pending === 'setup' ? 'Opening…' : 'Add a card'}
                      </button>
                      <button type="button" className="btn ghost" aria-disabled={pending !== null} onClick={addTestCard}>
                        {pending === 'test' ? 'Adding…' : 'Use a test card'}
                      </button>
                    </div>
                    <p className="payment-note">The test card is Stripe’s Visa ending 4242, for test mode only.</p>
                  </div>
                )}
              </>
            )}
            <p className="sr-only" role="status">
              {announcement}
            </p>
          </section>
        </div>
        {/* The numbers are no use where cards cannot be added. */}
        {(state.status !== 'ready' || state.publishableKey) && <TestCards />}
      </main>
    </div>
  );
}
