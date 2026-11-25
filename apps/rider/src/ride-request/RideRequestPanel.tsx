import type { MatchedDriver, RideRequest } from '@thirrem/types';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { formatCountdown, formatFare } from '../map/format';
import { pinText } from '../map/pin-text';
import type { PlanPoint } from '../map/planner';
import type { FareState } from '../map/useFareQuote';
import { useStreetName } from '../map/useStreetName';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { ArrivalStatus } from './ArrivalStatus';
import { cancelQuestion, LOCK_TEXT } from './cancel-text';
import { HoldButton } from './HoldButton';
import { useCancelRide } from './useCancelRide';

interface RideRequestPanelProps {
  rideRequest: RideRequest;
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  fare: FareState;
  onStartNew(): void;
  /** `paused` is set when the cancel paused Ride Requests. */
  onCancelled(paused: boolean): void;
  /** The API is looking for the matched Driver's route again. */
  onRouting(): void;
  /** For a failed Ride Request: asking for it again, or going back to the planner to change it. */
  retry: { ready: boolean; pending: boolean; error: string | null; onRetry(): void };
  onChange(): void;
  /** Set when the Rider has just asked for the Ride, with a button that has now gone. */
  focusTitle: boolean;
}

const rating = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 1 });

function DriverCard({ driver }: { driver: MatchedDriver }) {
  return (
    <div className="driver-card">
      <p className="driver-name" translate="no">
        {driver.name}
      </p>
      <p className="driver-rating">Rated {rating.format(driver.rating)} out of 5</p>
      <p className="driver-vehicle">
        {driver.vehicle.colour} <span translate="no">{driver.vehicle.model}</span>
      </p>
      <p className="driver-plate">
        <span className="sr-only">Number plate </span>
        <span translate="no">{driver.vehicle.plate}</span>
      </p>
    </div>
  );
}

function Point({ label, point }: { label: string; point: PlanPoint | null }) {
  const street = useStreetName(point);
  const text = point?.origin === 'device' ? 'Your location' : pinText(point, street);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{text || 'Finding the street…'}</dd>
    </div>
  );
}

export function RideRequestPanel({ rideRequest, pickup, dropoff, fare, onStartNew, onCancelled, onRouting, retry, onChange, focusTitle }: RideRequestPanelProps) {
  const { status, driver, approach, offers, vehicleType, cancellation } = rideRequest;
  const failed = status === 'failed';
  const type = VEHICLE_TYPE_NAMES[vehicleType];
  const quote = fare.status === 'ready' ? fare.fares.find((item) => item.vehicleType === vehicleType) : undefined;
  const [confirming, setConfirming] = useState<'cancel' | 'new' | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const cancelStart = useRef<HTMLButtonElement>(null);
  const newStart = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const asked = useRef<'cancel' | 'new' | null>(null);
  const cancelling = useCancelRide(onCancelled);
  const wouldPause = cancelling.wouldPause || Boolean(cancellation?.pausesRequests);

  useEffect(() => {
    if (cancelling.wouldPause) setConfirming('cancel');
  }, [cancelling.wouldPause]);

  useEffect(() => {
    if (focusTitle) title.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (asked.current) (asked.current === 'cancel' ? cancelStart : newStart).current?.focus();
    asked.current = confirming;
  }, [confirming]);

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setConfirming(null);
  };

  const cancelError = cancelling.error && (
    <div className="form-error" role="alert">
      <span>{cancelling.error}</span>
    </div>
  );

  return (
    <section className="planner ride-request" aria-labelledby="ride-request-title">
      <h1 id="ride-request-title" ref={title} tabIndex={-1}>
        {driver ? 'Your Driver' : failed ? 'Ride Request not accepted' : 'Finding your Driver'}
      </h1>
      {approach && (
        <ArrivalStatus
          approach={approach}
          onRouting={() => {
            // The button pressed is about to go, so focus is moved somewhere that stays.
            title.current?.focus({ preventScroll: true });
            onRouting();
          }}
        />
      )}
      <div role="status">
        {driver ? (
          <>
            <span className="sr-only">Driver matched. </span>
            <DriverCard driver={driver} />
          </>
        ) : failed ? (
          <p className="request-failed">
            {offers.length === 0 ? `No ${type} Drivers are close enough to your Pickup Point to ask.` : `The ${type} Drivers asked did not take your Ride.`} Try again, or change your Ride.
          </p>
        ) : (
          <p className="searching">
            <span className="spinner small" aria-hidden="true" />
            <span>
              {offers.length === 0
                ? `No ${type} Drivers are close by. Still searching…`
                : `Asked ${offers.length} ${type} ${offers.length === 1 ? 'Driver' : 'Drivers'} nearby. The first to accept gets your Ride.`}
            </span>
          </p>
        )}
      </div>
      {driver && <p className="request-note">A simulated Driver. Getting picked up is not part of the demo yet.</p>}

      <dl className="request-summary">
        <Point label="Pickup Point" point={pickup} />
        <Point label="Drop-off Point" point={dropoff} />
        <div>
          <dt>Vehicle Type</dt>
          <dd>{type}</dd>
        </div>
        <div>
          <dt>Fare</dt>
          <dd>{quote ? formatFare(quote.amountCents) : fare.status === 'error' ? 'Unavailable' : 'Loading…'}</dd>
        </div>
      </dl>

      {failed ? (
        <div className="request-reset">
          <div className="reset-actions">
            <button type="button" className="btn primary" disabled={!retry.ready} aria-disabled={retry.pending} onClick={retry.onRetry}>
              {retry.pending && <span className="spinner small" aria-hidden="true" />}
              {retry.pending ? 'Requesting…' : 'Try again'}
            </button>
            <button type="button" className="btn ghost" onClick={onChange}>
              Change your Ride
            </button>
          </div>
          {retry.error && (
            <div className="form-error" role="alert">
              <span>{retry.error}</span>
            </div>
          )}
        </div>
      ) : confirming === 'cancel' && cancellation ? (
        <div className="request-reset cancel-confirm" role="group" aria-labelledby="cancel-question" onKeyDown={closeOnEscape}>
          <p id="cancel-question" className={wouldPause ? 'cancel-cost is-pause' : 'reset-question'} aria-live="polite">
            {cancelQuestion(rideRequest, wouldPause)}
          </p>
          {/* Side by side, with the safe choice first, so that one is not pressed for the other. */}
          <div className="confirm-actions">
            <button type="button" className="btn primary" ref={keep} onClick={() => setConfirming(null)}>
              {driver ? 'Keep my Driver' : 'Keep Ride Request'}
            </button>
            <HoldButton label="Hold to cancel" pending={cancelling.pending} onHeld={() => cancelling.cancel(wouldPause)} />
          </div>
          {cancelError}
        </div>
      ) : confirming === 'new' ? (
        <div className="request-reset" role="group" aria-labelledby="reset-question" onKeyDown={closeOnEscape}>
          <p id="reset-question">Start a new Sandbox? This drops your Ride Request and places new Drivers.</p>
          {cancellation?.pausesRequests && <p className="cancel-cost is-pause">{LOCK_TEXT}</p>}
          <div className="reset-actions">
            <button type="button" className={`btn ${cancellation?.pausesRequests ? 'ghost' : 'primary'}`} onClick={onStartNew}>
              {cancellation?.pausesRequests ? 'Start new and pause' : 'Start new'}
            </button>
            <button type="button" className={`btn ${cancellation?.pausesRequests ? 'primary' : 'ghost'}`} ref={keep} onClick={() => setConfirming(null)}>
              Keep this one
            </button>
          </div>
        </div>
      ) : (
        <div className="request-reset">
          <div className="reset-actions">
            <button
              type="button"
              // Solid while quick, as the chance to take it runs out.
              className={`btn ${cancellation?.quickForS ? 'primary quick-cancel' : 'ghost'}`}
              ref={cancelStart}
              aria-disabled={cancelling.pending}
              // A free or quick cancel is done at once: asking first would use up the time it is quick for.
              onClick={() => (wouldPause || cancellation?.counts === 'late' ? setConfirming('cancel') : cancelling.cancel(false))}
            >
              {cancelling.pending && <span className="spinner small" aria-hidden="true" />}
              {cancellation?.quickForS ? (
                <>
                  Quick cancel <span className="quick-left">{formatCountdown(cancellation.quickForS)}</span>
                </>
              ) : (
                'Cancel Ride Request'
              )}
            </button>
            <button type="button" className="btn ghost" ref={newStart} onClick={() => setConfirming('new')}>
              Start a new Sandbox
            </button>
          </div>
          {cancelError}
        </div>
      )}
    </section>
  );
}
