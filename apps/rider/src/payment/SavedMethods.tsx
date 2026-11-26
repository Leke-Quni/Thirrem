import type { PaymentMethod } from '@thirrem/types';
import { useEffect, useRef, useState } from 'react';
import { cardEnding, cardName, WALLET_NAMES } from './payment-text';

interface SavedMethodsProps {
  methods: PaymentMethod[];
  /** Which change is on its way, if any. */
  pending: string | null;
  onMakeDefault(method: PaymentMethod): void;
  /** Resolves to whether the method was removed. */
  onRemove(method: PaymentMethod): Promise<boolean>;
}

export function SavedMethods({ methods, pending, onMakeDefault, onRemove }: SavedMethodsProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const kept = useRef<string | null>(null);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (kept.current) removeButtons.current.get(kept.current)?.focus();
    kept.current = null;
  }, [confirming]);

  if (methods.length === 0) return <p className="methods-empty">No payment method saved yet.</p>;

  return (
    <ul className="methods">
      {methods.map((method) => (
        <li key={method.id} className="method">
          <p className="method-name">
            <span className="method-brand" translate="no">
              {cardName(method.brand)}
            </span>{' '}
            <span className="method-digits">
              <span aria-hidden="true">•••• </span>
              {method.last4}
            </span>
          </p>
          {method.wallet && (
            <span className="method-wallet" translate="no">
              {WALLET_NAMES[method.wallet]}
            </span>
          )}
          {method.isDefault && <span className="method-default">Default</span>}
          {confirming === method.id ? (
            <div className="method-confirm" role="group" aria-labelledby={`remove-${method.id}`}>
              <p id={`remove-${method.id}`}>Remove {cardEnding(method)}?</p>
              <button
                type="button"
                className="btn primary"
                aria-disabled={pending !== null}
                onClick={async () => {
                  if (await onRemove(method)) setConfirming(null);
                }}
              >
                {pending === `remove:${method.id}` ? 'Removing…' : 'Remove card'}
              </button>
              <button
                type="button"
                className="btn ghost"
                ref={keep}
                onClick={() => {
                  kept.current = method.id;
                  setConfirming(null);
                }}
              >
                Keep it
              </button>
            </div>
          ) : (
            <div className="method-actions">
              {!method.isDefault && (
                <button type="button" className="btn ghost" aria-label={`Make ${cardEnding(method)} the default`} aria-disabled={pending !== null} onClick={() => onMakeDefault(method)}>
                  {pending === `default:${method.id}` ? 'Saving…' : 'Make default'}
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                aria-label={`Remove ${cardEnding(method)}`}
                ref={(button) => {
                  if (button) removeButtons.current.set(method.id, button);
                  else removeButtons.current.delete(method.id);
                }}
                onClick={() => setConfirming(method.id)}
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
