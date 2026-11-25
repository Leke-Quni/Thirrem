import type { MatchedDriver, RideRequest } from '@thirrem/types';
import { useEffect, useRef, useState } from 'react';
import { formatFare } from '../map/format';
import { pinText } from '../map/pin-text';
import type { PlanPoint } from '../map/planner';
import type { FareState } from '../map/useFareQuote';
import { useStreetName } from '../map/useStreetName';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { ArrivalStatus } from './ArrivalStatus';

interface RideRequestPanelProps {
  rideRequest: RideRequest;
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  fare: FareState;
  onStartNew(): void;
  /** The API is looking for the matched Driver's route again. */
  onRouting(): void;
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

export function RideRequestPanel({ rideRequest, pickup, dropoff, fare, onStartNew, onRouting, focusTitle }: RideRequestPanelProps) {
  const { driver, approach, offers, vehicleType } = rideRequest;
  const type = VEHICLE_TYPE_NAMES[vehicleType];
  const quote = fare.status === 'ready' ? fare.fares.find((item) => item.vehicleType === vehicleType) : undefined;
  const [confirming, setConfirming] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (focusTitle) title.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (asked.current) start.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  return (
    <section className="planner ride-request" aria-labelledby="ride-request-title">
      <h1 id="ride-request-title" ref={title} tabIndex={-1}>
        {driver ? 'Your Driver' : 'Finding your Driver'}
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
        ) : (
          <p className="searching">
            {offers.length > 0 && <span className="spinner small" aria-hidden="true" />}
            <span>
              {offers.length === 0
                ? `No ${type} Drivers are nearby. Start a new Sandbox to try again.`
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

      {confirming ? (
        <div className="request-reset" role="group" aria-labelledby="reset-question">
          <p id="reset-question">Start a new Sandbox? This drops your Ride Request and places new Drivers.</p>
          <div className="reset-actions">
            <button type="button" className="btn primary" onClick={onStartNew}>
              Start new
            </button>
            <button type="button" className="btn ghost" ref={keep} onClick={() => setConfirming(false)}>
              Keep this one
            </button>
          </div>
        </div>
      ) : (
        <div className="request-reset">
          <button type="button" className="btn ghost" ref={start} onClick={() => setConfirming(true)}>
            Start a new Sandbox
          </button>
        </div>
      )}
    </section>
  );
}
