import type { Receipt } from '@thirrem/types';
import { DROPOFF_PIN_PATH, DROPOFF_PIN_VIEWBOX } from '../map/pin-shape';
import { formatDistance, formatDuration, formatFare } from '../map/format';
import { VEHICLE_TYPE_NAMES } from '../map/VehicleTypeList';
import { cardEnding } from '../payment/payment-text';
import { formatRequestedAt } from './receipt-text';

function Line({ label, measure, cents }: { label: string; measure?: string; cents: number }) {
  return (
    <tr>
      <th scope="row">
        {label} {measure && <span>{measure}</span>}
      </th>
      <td>{formatFare(cents)}</td>
    </tr>
  );
}

/** The Ride from its Pickup Point to its Drop-off Point, then the amounts that add up to what was charged. */
export function ReceiptDetails({ receipt }: { receipt: Receipt }) {
  const { breakdown, adjustmentCents } = receipt;
  return (
    <article className="payment-panel receipt">
      <p className="receipt-when">
        <time dateTime={receipt.requestedAt}>{formatRequestedAt(receipt.requestedAt)}</time>
        <span>{VEHICLE_TYPE_NAMES[receipt.vehicleType]}</span>
      </p>
      <dl className="receipt-route">
        <div>
          <dt>
            <span className="pin-glyph pin-pickup" aria-hidden="true" />
            Pickup Point
          </dt>
          <dd>{receipt.pickupName}</dd>
        </div>
        <div>
          <dt>
            <svg className="pin-glyph pin-glyph-drop" viewBox={DROPOFF_PIN_VIEWBOX} aria-hidden="true">
              <path d={DROPOFF_PIN_PATH} fill="var(--accent-solid)" stroke="var(--fg)" strokeWidth="2.5" />
              <circle cx="17" cy="16.5" r="5.5" fill="var(--fg)" />
            </svg>
            Drop-off Point
          </dt>
          <dd>{receipt.dropoffName}</dd>
        </div>
      </dl>
      <table className="receipt-lines">
        <caption className="sr-only">Fare breakdown</caption>
        <tbody>
          <Line label="Base" cents={breakdown.baseCents} />
          <Line label="Distance" measure={formatDistance(receipt.distanceM)} cents={breakdown.distanceCents} />
          <Line label="Time" measure={formatDuration(receipt.durationS)} cents={breakdown.timeCents} />
          <Line label="Long distance" cents={breakdown.longDistanceCents} />
          {adjustmentCents < 0 && <Line label="Limited to your quoted Fare" cents={adjustmentCents} />}
        </tbody>
        <tfoot>
          <Line label="Total charged" cents={receipt.amountCents} />
        </tfoot>
      </table>
      <p className="receipt-paid">Paid with {cardEnding(receipt.paymentMethod)}</p>
      <p className="payment-note">A simulated Ride in test mode. No real money was taken.</p>
    </article>
  );
}
