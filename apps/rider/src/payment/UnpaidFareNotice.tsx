import type { UnpaidFare } from '@thirrem/types';
import { Link } from 'react-router-dom';
import { formatFare } from '../map/format';

/** Tells the Rider that a Fare could not be charged, and where to pay it. */
export function UnpaidFareNotice({ fares }: { fares: UnpaidFare[] }) {
  if (fares.length === 0) return null;
  const total = formatFare(fares.reduce((sum, fare) => sum + fare.amountCents, 0));
  const one = fares.length === 1;
  return (
    <div className="unpaid-notice">
      <p role="alert">
        {one ? `Your ${total} Fare could not be charged. Pay it` : `${fares.length} Fares, ${total} in all, could not be charged. Pay them`} before requesting another Ride.
      </p>
      <Link className="btn primary" to="/payment">
        {one ? 'Pay your Fare' : 'Pay your Fares'}
      </Link>
    </div>
  );
}
