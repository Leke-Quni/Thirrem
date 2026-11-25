import type { VehicleType } from '@thirrem/types';
import type { CSSProperties } from 'react';
import { formatFare } from './format';
import type { FareState } from './useFareQuote';

export const VEHICLE_TYPE_NAMES: Record<VehicleType, string> = { economy: 'Economy', comfort: 'Comfort', xl: 'XL', electric: 'Electric' };
const VEHICLE_TYPES = Object.entries(VEHICLE_TYPE_NAMES) as Array<[VehicleType, string]>;

interface VehicleTypeListProps {
  fare: FareState;
  selected: VehicleType;
  onSelect(type: VehicleType): void;
}

function Amount({ fare, type }: { fare: FareState; type: VehicleType }) {
  if (fare.status === 'loading') return <span className="fare-pending" aria-hidden="true" />;
  const quote = fare.status === 'ready' ? fare.fares.find((item) => item.vehicleType === type) : undefined;
  if (!quote) return <span className="fare-none" aria-hidden="true">–</span>;
  const text = formatFare(quote.amountCents);
  return (
    <span className="fare-amount" style={{ '--chars': text.length } as CSSProperties}>
      {text}
    </span>
  );
}

export function VehicleTypeList({ fare, selected, onSelect }: VehicleTypeListProps) {
  return (
    <fieldset className="vehicle-types">
      <legend>Choose a Vehicle Type</legend>
      {VEHICLE_TYPES.map(([type, name]) => (
        <label key={type} className="vehicle-type">
          <input type="radio" name="vehicle-type" value={type} checked={selected === type} onChange={() => onSelect(type)} />
          <span className="vehicle-name">{name}</span>
          <Amount fare={fare} type={type} />
        </label>
      ))}
      <span className="sr-only" role="status">
        {fare.status === 'loading' ? 'Loading the Fares…' : fare.status === 'ready' ? 'Fares updated.' : ''}
      </span>
    </fieldset>
  );
}
