import type { VehicleType } from '@thirrem/types';
import type { Trip } from '../fares/fare-calculator.js';

export type RidePaymentStatus =
  /** Being held, or waiting for the Rider's bank to verify them. No Ride Request has it yet. */
  | 'pending'
  | 'held'
  | 'declined'
  /** Due to be charged `chargeCents`. */
  | 'charging'
  | 'charged'
  /** Due to be released in full. */
  | 'releasing'
  | 'released'
  /** The Fare is due but its hold can no longer be charged. */
  | 'unpaid';

/** What was asked for, and the quoted Fare for it. The points are kept by name only. */
export interface QuotedRide {
  vehicleType: VehicleType;
  pickupName: string;
  dropoffName: string;
  trip: Trip;
  amountCents: number;
}

export interface RidePayment extends Omit<QuotedRide, 'amountCents'> {
  id: string;
  accountId: string;
  rideRequestId: string | null;
  /** The payment service's reference to the hold, once there is one. */
  holdRef: string | null;
  status: RidePaymentStatus;
  heldCents: number;
  chargeCents: number | null;
  requestedAtMs: number;
  settledAtMs: number | null;
}

export type RidePaymentChanges = Partial<Pick<RidePayment, 'rideRequestId' | 'holdRef' | 'status' | 'trip' | 'chargeCents' | 'settledAtMs'>>;

/** Those still with money held, or about to have. */
export const OPEN_STATUSES: readonly RidePaymentStatus[] = ['pending', 'held', 'charging', 'releasing'];

export abstract class RidePaymentRepository {
  abstract add(payment: RidePayment): Promise<void>;
  /** Changes a payment, but only if it is still `from`, and says whether it was. */
  abstract update(id: string, changes: RidePaymentChanges, from: RidePaymentStatus): Promise<boolean>;
  abstract find(accountId: string, id: string): Promise<RidePayment | null>;
  /** The newest of those given to a Ride Request. */
  abstract findLatest(accountId: string, rideRequestId: string): Promise<RidePayment | null>;
  abstract findOpen(accountId: string): Promise<RidePayment[]>;
  abstract findAccountsWithOpen(): Promise<string[]>;
}
