import type { Receipt } from '@thirrem/types';
import { Link } from 'react-router-dom';
import { formatFare } from '../map/format';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { formatRequestedAt } from './receipt-text';

export function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  if (receipts.length === 0) {
    return (
      <div className="receipts-empty">
        <p>
          <strong>No receipts yet.</strong> One appears here after each Ride you pay for.
        </p>
        <Link className="btn primary" to="/home">
          Request a Ride
        </Link>
      </div>
    );
  }
  return (
    <ul className="receipts">
      {receipts.map((receipt) => (
        <li key={receipt.id}>
          <Link to={`/receipts/${receipt.id}`}>
            <time dateTime={receipt.requestedAt}>{formatRequestedAt(receipt.requestedAt)}</time>
            <strong>{formatFare(receipt.amountCents)}</strong>
            <span>
              {receipt.pickupName} to {receipt.dropoffName}
            </span>
            <span>{VEHICLE_TYPE_NAMES[receipt.vehicleType]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
