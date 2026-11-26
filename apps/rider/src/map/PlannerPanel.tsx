import type { PlaceResult, VehicleType } from '@thirrem/types';
import { type CSSProperties, useEffect, useRef } from 'react';
import type { RequestFailure } from '../payment/payment-refusal';
import { RequestError } from '../payment/RequestError';
import { formatCountdown, formatDistance, formatDuration } from './format';
import { PlaceSearch } from './PlaceSearch';
import { DROPOFF_PIN_PATH, DROPOFF_PIN_VIEWBOX } from './pin-shape';
import { pinText, type StreetLookup } from './pin-text';
import type { PinSlot, Plan, PlanPoint } from './planner';
import type { FareState } from './useFareQuote';
import type { RouteState } from './useRoute';
import { useStreetName } from './useStreetName';
import { VEHICLE_TYPE_NAMES, VehicleTypeList } from './VehicleTypeList';

interface PlannerPanelProps {
  plan: Plan;
  route: RouteState;
  fare: FareState;
  vehicleType: VehicleType;
  mapReady: boolean;
  locating: boolean;
  locateMessage: string | null;
  onLocate(): void;
  onSelect(slot: PinSlot): void;
  onRemove(slot: PinSlot): void;
  onChoosePlace(slot: PinSlot, place: PlaceResult): void;
  onRetry(): void;
  onChooseVehicleType(type: VehicleType): void;
  onRetryFare(): void;
  /** Set when the planner takes the place of a Ride Request, whose buttons held focus. */
  focusTitle: boolean;
  /** `pausedForS` counts down while the Rider cannot request a Ride, having cancelled too often. */
  request: { ready: boolean; pending: boolean; verifying: boolean; error: RequestFailure | null; pausedForS: number | null; onRequest(): void };
}

const SLOTS: Array<{ slot: PinSlot; label: string }> = [
  { slot: 'pickup', label: 'Pickup Point' },
  { slot: 'dropoff', label: 'Drop-off Point' },
];

const describe = (point: PlanPoint) => (point.origin === 'device' ? 'Your location' : (point.label ?? 'Set on the map'));

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd style={{ '--chars': value.length } as CSSProperties}>{value}</dd>
    </div>
  );
}

function Glyph({ slot }: { slot: PinSlot }) {
  if (slot === 'pickup') return <span className="pin-glyph pin-pickup" aria-hidden="true" />;
  return (
    <svg className="pin-glyph-drop" width="17" height="22" viewBox={DROPOFF_PIN_VIEWBOX} aria-hidden="true">
      <path d={DROPOFF_PIN_PATH} fill="var(--accent-solid)" stroke="var(--fg)" strokeWidth="2.5" />
      <circle cx="17" cy="16.5" r="5.5" fill="var(--fg)" />
    </svg>
  );
}

export function PlannerPanel({ plan, route, fare, vehicleType, mapReady, locating, locateMessage, onLocate, onSelect, onRemove, onChoosePlace, onRetry, onChooseVehicleType, onRetryFare, focusTitle, request }: PlannerPanelProps) {
  const near = plan.pickup ?? plan.dropoff;
  const streets: Record<PinSlot, StreetLookup> = { pickup: useStreetName(plan.pickup), dropoff: useStreetName(plan.dropoff) };
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) title.current?.focus({ preventScroll: true });
  }, []);
  // What is missing is already said by the route summary and the message on the map.
  const requestable = Boolean(plan.pickup && plan.dropoff) && route.status === 'ready' && request.ready && !request.pausedForS;
  return (
    <section className="planner" aria-labelledby="planner-title">
      <h1 id="planner-title" ref={title} tabIndex={-1}>
        Plan your ride
      </h1>
      <p className="planner-lead">Search for a street or place, or click the map to drop a pin where there is no street name.</p>

      <ul className="pin-rows">
        {SLOTS.map(({ slot, label }) => {
          const point = plan[slot];
          const active = plan.active === slot;
          const finding = slot === 'pickup' && locating && !point;
          return (
            <li key={slot} className={`pin-slot${active ? ' is-active' : ''}`}>
              <div className="pin-row">
                <button type="button" className="pin-row-main" onClick={() => onSelect(slot)} aria-pressed={active} disabled={!mapReady}>
                  <Glyph slot={slot} />
                  <span className="pin-row-text">
                    <strong>{label}</strong>
                    <span>{point ? describe(point) : finding ? 'Finding your location…' : active ? 'Search below or click the map' : 'Not set'}</span>
                  </span>
                </button>
                {slot === 'pickup' && (
                  <button type="button" className="icon-btn pin-locate" onClick={onLocate} disabled={!mapReady || locating} aria-label="Use my location as the Pickup Point" title="Use my location">
                    {locating ? (
                      <span className="spinner small" aria-hidden="true" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3.5" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    )}
                  </button>
                )}
                {point && (
                  <button type="button" className="icon-btn pin-remove" onClick={() => onRemove(slot)} aria-label={`Remove the ${label}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
              <PlaceSearch label={label} value={pinText(point, streets[slot])} near={near} disabled={!mapReady} onFocus={() => onSelect(slot)} onChoose={(place) => onChoosePlace(slot, place)} />
            </li>
          );
        })}
      </ul>

      <p className="locate-note" role="status">
        {locateMessage ?? 'Your location places the pin and Drivers. It is not saved.'}
      </p>

      <div className="route-summary" aria-live="polite">
        {route.status === 'idle' && <p className="route-hint">The route, distance, time and Fares appear once both pins are placed.</p>}
        {route.status === 'loading' && (
          <div className="route-skeleton" role="status" aria-label="Loading the route…">
            <span /> <span />
          </div>
        )}
        {route.status === 'ready' && (
          <dl className="route-figures">
            <Figure label="Distance" value={formatDistance(route.route.distanceM)} />
            <Figure label="Drive time" value={formatDuration(route.route.durationS)} />
          </dl>
        )}
        {route.status === 'error' && (
          <div className="form-error" role="alert">
            <span>{route.message}</span>
            <button type="button" className="btn ghost retry" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>

      <VehicleTypeList fare={fare} selected={vehicleType} onSelect={onChooseVehicleType} />
      {fare.status === 'error' && route.status !== 'error' && (
        <div className="form-error fare-error" role="alert">
          <span>{fare.message}</span>
          <button type="button" className="btn ghost retry" onClick={onRetryFare}>
            Try again
          </button>
        </div>
      )}

      <div className="request-ride">
        {request.pausedForS && (
          <div className="pause-note" id="pause-note">
            {/* Only the reason is announced: a countdown read out every second would drown everything else. */}
            <p role="status">Ride Requests are paused after too many cancellations.</p>
            <p>
              Request again in <strong>{formatCountdown(request.pausedForS)}</strong>
            </p>
          </div>
        )}
        <button type="button" className="btn primary" disabled={!requestable || request.pending} aria-describedby={request.pausedForS ? 'pause-note' : undefined} onClick={request.onRequest}>
          {request.pending && <span className="spinner small" aria-hidden="true" />}
          {request.verifying ? 'Checking with your bank…' : request.pending ? 'Requesting…' : `Request ${VEHICLE_TYPE_NAMES[vehicleType]}`}
        </button>
        <RequestError failure={request.error} />
      </div>
    </section>
  );
}
