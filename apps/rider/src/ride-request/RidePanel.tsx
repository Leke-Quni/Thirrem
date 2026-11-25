import type { Ride } from '@thirrem/types';
import { useEffect, useRef } from 'react';
import { formatFare } from '../map/format';
import type { PlanPoint } from '../map/planner';
import type { FareState } from '../map/useFareQuote';
import { ArrivalStatus } from './ArrivalStatus';
import { NewSandbox } from './NewSandbox';
import { DriverCard, RideSummary } from './ride-details';

interface RidePanelProps {
  ride: Ride;
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  fare: FareState;
  onStartNew(): void;
  /** The Rider is done with the completed Ride and wants to make another Ride Request. */
  onDone(): void;
  /** The API is looking for the Ride's route again. */
  onRouting(): void;
  /** Set when the Rider asked for this Ride here, so focus may be moved to it from a button that has gone. */
  focusTitle: boolean;
}

export function RidePanel({ ride, pickup, dropoff, fare, onStartNew, onDone, onRouting, focusTitle }: RidePanelProps) {
  const { finalFare } = ride;
  const title = useRef<HTMLHeadingElement>(null);

  // Pickup replaces the panel the Rider may have been in, and completing removes its buttons. Focus elsewhere, such as on the map, is left alone.
  const shown = useRef(false);
  useEffect(() => {
    if ((focusTitle || shown.current) && document.activeElement === document.body) title.current?.focus({ preventScroll: true });
    shown.current = true;
  }, [finalFare !== null]);

  return (
    <section className="planner ride-request" aria-labelledby="ride-title">
      <h1 id="ride-title" ref={title} tabIndex={-1}>
        {finalFare ? 'Ride complete' : 'On your Ride'}
      </h1>
      <ArrivalStatus
        progress={ride.progress}
        to="dropoff"
        onRouting={() => {
          // The button pressed is about to go, so focus is moved somewhere that stays.
          title.current?.focus({ preventScroll: true });
          onRouting();
        }}
      />
      {/* Always here, so that a screen reader hears the final Fare as it arrives. */}
      <div role="status" className={finalFare ? 'final-fare' : 'sr-only'}>
        {finalFare && (
          <>
            <span>Final Fare</span> <strong>{formatFare(finalFare.amountCents)}</strong>
          </>
        )}
      </div>
      <DriverCard driver={ride.driver} />
      <p className="request-note">{finalFare ? 'A simulated Ride. No money was charged.' : 'A simulated Driver. Your Ride ends at your Drop-off Point.'}</p>
      <RideSummary pickup={pickup} dropoff={dropoff} vehicleType={ride.vehicleType} fare={finalFare ? undefined : fare} />
      {finalFare ? (
        <div className="request-reset">
          <button type="button" className="btn primary" onClick={onDone}>
            Request another Ride
          </button>
        </div>
      ) : (
        <NewSandbox drops="your Ride" onStartNew={onStartNew} />
      )}
    </section>
  );
}
