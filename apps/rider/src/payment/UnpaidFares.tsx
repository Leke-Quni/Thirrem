import type { PaymentMethod, UnpaidFare } from '@thirrem/types';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { formatFare } from '../map/format';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { cardEnding } from './payment-text';
import { unpaidFareApi } from './unpaid-fare-api';
import { useHeldSend } from './useHeldSend';
import type { useUnpaidFares } from './useUnpaidFares';

const requestedOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

interface UnpaidFaresProps {
  unpaid: ReturnType<typeof useUnpaidFares>;
  /** The saved methods, or null while they are not to hand. */
  methods: PaymentMethod[] | null;
}

/** The Fares that could not be charged, each to be paid on a method the Rider chooses. */
export function UnpaidFares({ unpaid: { fares, setFares, error, retry }, methods }: UnpaidFaresProps) {
  const [paid, setPaid] = useState<string | null>(null);
  const done = useRef<HTMLParagraphElement>(null);

  // The button pressed has gone, so focus is moved to what took its place.
  useEffect(() => {
    if (paid) done.current?.focus();
  }, [paid]);

  const onPaid = (fare: UnpaidFare, left: UnpaidFare[]) => {
    setPaid(`Fare of ${formatFare(fare.amountCents)} paid.${left.length ? '' : ' You can request Rides again.'}`);
    setFares(left);
  };

  return (
    <>
      {paid && (
        <p className="fare-paid" ref={done} role="status" tabIndex={-1}>
          {paid}
        </p>
      )}
      {(fares.length > 0 || error) && (
        <section className="payment-panel unpaid-fares" aria-labelledby="unpaid-fares">
          <h2 id="unpaid-fares">{fares.length > 1 ? 'Unpaid Fares' : 'Unpaid Fare'}</h2>
          {error && (
            <>
              <p className="form-error" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
              </p>
              <div className="payment-buttons">
                <button type="button" className="btn ghost" onClick={retry}>
                  Try again
                </button>
              </div>
            </>
          )}
          {fares.map((fare) => (
            <PayFare key={fare.id} fare={fare} methods={methods} onPaid={(left) => onPaid(fare, left)} />
          ))}
        </section>
      )}
    </>
  );
}

function PayFare({ fare, methods, onPaid }: { fare: UnpaidFare; methods: PaymentMethod[] | null; onPaid(left: UnpaidFare[]): void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const { pending, verifying, error, run, clearError } = useHeldSend();
  const method = methods?.find((each) => each.id === chosen) ?? methods?.find((each) => each.isDefault);
  const amount = formatFare(fare.amountCents);

  const pay = () => {
    if (!method) return;
    run(
      (holdId) => unpaidFareApi.pay(fare.id, method.id, holdId),
      ({ fares }) => onPaid(fares),
      'Your Fare could not be paid. Try again.',
    );
  };

  return (
    <div className="unpaid-fare">
      <p className="unpaid-amount">
        <strong>{amount}</strong> <span>could not be charged.</span>
      </p>
      <p className="unpaid-ride">
        {VEHICLE_TYPE_NAMES[fare.vehicleType]} from {fare.pickupName} to {fare.dropoffName}, requested {requestedOn.format(new Date(fare.requestedAt))}.
      </p>
      {methods &&
        (method ? (
          <>
            <fieldset className="pay-with" disabled={pending}>
              <legend>Pay with</legend>
              {methods.map((each) => (
                <label key={each.id}>
                  <input
                    type="radio"
                    name={`pay-with-${fare.id}`}
                    checked={each.id === method.id}
                    onChange={() => {
                      clearError();
                      setChosen(each.id);
                    }}
                  />
                  <span>
                    {cardEnding(each)}
                    {each.isDefault ? ' (default)' : ''}
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                <Icon name="alert" />
                <span>{error.message}</span>
              </p>
            )}
            <div className="payment-buttons">
              <button type="button" className="btn primary" aria-disabled={pending} onClick={pay}>
                {pending && <span className="spinner small" aria-hidden="true" />}
                {verifying ? 'Checking with your bank…' : pending ? 'Paying…' : `Pay ${amount}`}
              </button>
            </div>
          </>
        ) : (
          <p className="payment-note">Add a payment method below to pay it.</p>
        ))}
    </div>
  );
}
