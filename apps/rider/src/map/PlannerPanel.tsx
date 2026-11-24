import type { PlaceResult } from '@thirrem/types';
import { formatDistance, formatDuration } from './format';
import { PlaceSearch } from './PlaceSearch';
import { DROPOFF_PIN_PATH, DROPOFF_PIN_VIEWBOX } from './pin-shape';
import { pinText, type StreetLookup } from './pin-text';
import type { PinSlot, Plan, PlanPoint } from './planner';
import type { RouteState } from './useRoute';
import { useStreetName } from './useStreetName';

interface PlannerPanelProps {
  plan: Plan;
  route: RouteState;
  mapReady: boolean;
  locating: boolean;
  locateMessage: string | null;
  onLocate(): void;
  onSelect(slot: PinSlot): void;
  onRemove(slot: PinSlot): void;
  onChoosePlace(slot: PinSlot, place: PlaceResult): void;
  onRetry(): void;
}

const SLOTS: Array<{ slot: PinSlot; label: string }> = [
  { slot: 'pickup', label: 'Pickup Point' },
  { slot: 'dropoff', label: 'Drop-off Point' },
];

const describe = (point: PlanPoint) => (point.origin === 'device' ? 'Your location' : (point.label ?? 'Set on the map'));

function Glyph({ slot }: { slot: PinSlot }) {
  if (slot === 'pickup') return <span className="pin-glyph pin-pickup" aria-hidden="true" />;
  return (
    <svg className="pin-glyph-drop" width="17" height="22" viewBox={DROPOFF_PIN_VIEWBOX} aria-hidden="true">
      <path d={DROPOFF_PIN_PATH} fill="var(--accent-solid)" stroke="var(--fg)" strokeWidth="2.5" />
      <circle cx="17" cy="16.5" r="5.5" fill="var(--fg)" />
    </svg>
  );
}

export function PlannerPanel({ plan, route, mapReady, locating, locateMessage, onLocate, onSelect, onRemove, onChoosePlace, onRetry }: PlannerPanelProps) {
  const near = plan.pickup ?? plan.dropoff;
  const streets: Record<PinSlot, StreetLookup> = { pickup: useStreetName(plan.pickup), dropoff: useStreetName(plan.dropoff) };
  return (
    <section className="planner" aria-labelledby="planner-title">
      <h1 id="planner-title">Plan your ride</h1>
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
        {locateMessage ?? 'Using your location only places the pin. It is not stored.'}
      </p>

      <div className="route-summary" aria-live="polite">
        {route.status === 'idle' && <p className="route-hint">The route, distance and time appear once both pins are placed.</p>}
        {route.status === 'loading' && (
          <div className="route-skeleton" role="status" aria-label="Loading the route…">
            <span /> <span />
          </div>
        )}
        {route.status === 'ready' && (
          <dl className="route-figures">
            <div>
              <dt>Distance</dt>
              <dd>{formatDistance(route.route.distanceM)}</dd>
            </div>
            <div>
              <dt>Drive time</dt>
              <dd>{formatDuration(route.route.durationS)}</dd>
            </div>
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
    </section>
  );
}
