import { Link } from 'react-router-dom';
import { receiptApi } from './receipt-api';
import { useLoaded } from './useLoaded';

/** The way to the receipt of a completed Ride. There is none for a Ride that has not been paid for. */
export function RideReceiptLink({ rideId, occasion }: { rideId: string; occasion: string }) {
  const { state } = useLoaded(() => receiptApi.list(), true, `${rideId} ${occasion}`);
  if (state.status === 'loading') return null;
  const receipt = state.status === 'ready' ? state.value.receipts.find((each) => each.rideId === rideId) : undefined;
  if (state.status === 'ready' && !receipt) return null;
  return (
    <Link className="btn ghost" to={receipt ? `/receipts/${receipt.id}` : '/receipts'}>
      {receipt ? 'View receipt' : 'See your receipts'}
    </Link>
  );
}
