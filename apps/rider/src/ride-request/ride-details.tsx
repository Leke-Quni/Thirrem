import type { MatchedDriver, VehicleType } from '@thirrem/types';
import { formatFare } from '../map/format';
import { pinText } from '../map/pin-text';
import type { PlanPoint } from '../map/planner';
import type { FareState } from '../map/useFareQuote';
import { useStreetName } from '../map/useStreetName';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';

const rating = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 1 });

export function DriverCard({ driver }: { driver: MatchedDriver }) {
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

interface RideSummaryProps {
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  vehicleType: VehicleType;
  fare: FareState;
}

export function RideSummary({ pickup, dropoff, vehicleType, fare }: RideSummaryProps) {
  const quote = fare.status === 'ready' ? fare.fares.find((item) => item.vehicleType === vehicleType) : undefined;
  return (
    <dl className="request-summary">
      <Point label="Pickup Point" point={pickup} />
      <Point label="Drop-off Point" point={dropoff} />
      <div>
        <dt>Vehicle Type</dt>
        <dd>{VEHICLE_TYPE_NAMES[vehicleType]}</dd>
      </div>
      <div>
        <dt>Fare</dt>
        <dd>{quote ? formatFare(quote.amountCents) : fare.status === 'error' ? 'Unavailable' : 'Loading…'}</dd>
      </div>
    </dl>
  );
}
