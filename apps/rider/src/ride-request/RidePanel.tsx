import type { Ride } from '@thirrem/types';
import { useEffect, useRef } from 'react';
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
  /** The API is looking for the Ride's route again. */
  onRouting(): void;
  /** Set when the Rider asked for this Ride here, so focus may be moved to it from a button that has gone. */
  focusTitle: boolean;
}

export function RidePanel({ ride, pickup, dropoff, fare, onStartNew, onRouting, focusTitle }: RidePanelProps) {
  const title = useRef<HTMLHeadingElement>(null);

  // Pickup replaces the panel the Rider may have been in. Focus elsewhere, such as on the map, is left alone.
  useEffect(() => {
    if (focusTitle && document.activeElement === document.body) title.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="planner ride-request" aria-labelledby="ride-title">
      <h1 id="ride-title" ref={title} tabIndex={-1}>
        On your Ride
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
      <DriverCard driver={ride.driver} />
      <p className="request-note">A simulated Driver. Completing the Ride is not part of the demo yet.</p>
      <RideSummary pickup={pickup} dropoff={dropoff} vehicleType={ride.vehicleType} fare={fare} />
      <NewSandbox drops="your Ride" onStartNew={onStartNew} />
    </section>
  );
}
