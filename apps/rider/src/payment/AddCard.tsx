import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance, Stripe } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

const NOT_LOADED = 'Stripe’s card form could not be loaded. Check your connection, then cancel and try again.';

interface AddCardProps {
  publishableKey: string;
  clientSecret: string;
  /** Stripe has accepted the card. Saves it, and resolves to whether it was saved. */
  onAccepted(setupId: string): Promise<boolean>;
  onCancel(): void;
}

/** Stripe's form takes the card number and security code, so neither ever passes through Thirrem. */
export function AddCard({ publishableKey, clientSecret, onAccepted, onCancel }: AddCardProps) {
  const [failed, setFailed] = useState(false);
  const stripe = useMemo<Promise<Stripe | null>>(
    () =>
      loadStripe(publishableKey).catch(() => {
        setFailed(true);
        return null;
      }),
    [publishableKey],
  );
  const appearance = useStripeAppearance();

  if (failed) return <CardFailed message={NOT_LOADED} onCancel={onCancel} />;
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance }}>
      <CardForm onAccepted={onAccepted} onCancel={onCancel} onFailure={() => setFailed(true)} />
    </Elements>
  );
}

function CardForm({ onAccepted, onCancel, onFailure }: Pick<AddCardProps, 'onAccepted' | 'onCancel'> & { onFailure(): void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stripe accepts a setup once, so a card that was accepted but not saved is only saved again.
  const accepted = useRef<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !ready || saving) return;
    setSaving(true);
    setError(null);
    if (!accepted.current) {
      // Any extra check by the bank opens over this page; a method that has to leave it returns to /payment.
      const result = await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: `${window.location.origin}/payment` } });
      if (result.error) {
        // A mistake in a field is shown by the form itself, which also moves to it.
        if (result.error.type !== 'validation_error') setError(result.error.message ?? 'Your card was not accepted. Check it and try again.');
        setSaving(false);
        return;
      }
      accepted.current = result.setupIntent.id;
    }
    if (!(await onAccepted(accepted.current))) setSaving(false);
  };

  return (
    <form className="card-form" onSubmit={submit}>
      <div className="card-fields">
        {!ready && <span className="sr-only" role="status">Loading the card form…</span>}
        {!ready && <span className="skeleton-block card-fields-skeleton" aria-hidden="true" />}
        <PaymentElement options={{ layout: 'tabs', business: { name: 'Thirrem' }, wallets: { link: 'never' } }} onReady={() => setReady(true)} onLoadError={onFailure} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      )}
      <div className="payment-buttons">
        <button type="submit" className="btn primary" disabled={!ready || saving}>
          {saving ? 'Saving…' : 'Save payment method'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CardFailed({ message, onCancel }: { message: string; onCancel(): void }) {
  return (
    <div className="card-form">
      <p className="form-error" role="alert">
        <Icon name="alert" />
        <span>{message}</span>
      </p>
      <div className="payment-buttons">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const readTheme = () => document.documentElement.dataset.theme;

/** Matches Stripe's form to the theme, which it cannot read from the page itself. */
function useStripeAppearance(): Appearance {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return useMemo(() => {
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const dark = theme === 'dark';
    return {
      theme: dark ? 'night' : 'stripe',
      variables: {
        colorPrimary: token('--accent'),
        colorBackground: dark ? '#14161d' : '#ffffff',
        colorText: token('--fg'),
        colorTextSecondary: token('--muted'),
        colorDanger: token('--danger'),
        borderRadius: token('--radius-btn'),
        fontFamily: 'system-ui, sans-serif',
      },
    };
  }, [theme]);
}
