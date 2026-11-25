import type { RideRequest } from '@thirrem/types';
import { useEffect, useRef } from 'react';
import type { PlanPoint } from '../map/planner';
import type { FareState } from '../map/useFareQuote';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { ArrivalStatus } from './ArrivalStatus';
import { NewSandbox } from './NewSandbox';
import { DriverCard, RideSummary } from './ride-details';

interface RideRequestPanelProps {
  rideRequest: RideRequest;
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  fare: FareState;
  onStartNew(): void;
  /** The API is looking for the matched Driver's route again. */
  onRouting(): void;
  /** For a failed Ride Request: asking for it again, or going back to the planner to change it. */
  retry: { ready: boolean; pending: boolean; error: string | null; onRetry(): void };
  onChange(): void;
  /** Set when the Rider has just asked for the Ride, with a button that has now gone. */
  focusTitle: boolean;
}

export function RideRequestPanel({ rideRequest, pickup, dropoff, fare, onStartNew, onRouting, retry, onChange, focusTitle }: RideRequestPanelProps) {
  const { status, driver, approach, offers, vehicleType } = rideRequest;
  const failed = status === 'failed';
  const type = VEHICLE_TYPE_NAMES[vehicleType];
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTitle) title.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="planner ride-request" aria-labelledby="ride-request-title">
      <h1 id="ride-request-title" ref={title} tabIndex={-1}>
        {driver ? 'Your Driver' : failed ? 'Ride Request not accepted' : 'Finding your Driver'}
      </h1>
      {approach && (
        <ArrivalStatus
          progress={approach}
          to="pickup"
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
      {driver && <p className="request-note">A simulated Driver. Your Ride starts once they have picked you up.</p>}

      <RideSummary pickup={pickup} dropoff={dropoff} vehicleType={vehicleType} fare={fare} />

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
      ) : (
        <NewSandbox drops="your Ride Request" onStartNew={onStartNew} />
      )}
    </section>
  );
}
