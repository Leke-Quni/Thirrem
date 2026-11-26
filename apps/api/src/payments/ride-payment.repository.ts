import type { FareBreakdown, PaymentMethod, VehicleType } from '@thirrem/types';
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
  | 'unpaid'
  /** An unpaid Fare being paid again, whose new hold waits for the Rider's bank to verify them. */
  | 'retrying';

/** What was asked for, and the quoted Fare for it. The points are kept by name only. */
export interface QuotedRide {
  vehicleType: VehicleType;
  pickupName: string;
  dropoffName: string;
  trip: Trip;
  amountCents: number;
}

/** The card a hold was placed on, as it was then, so it can be named once it is no longer saved. */
export type HeldCard = Pick<PaymentMethod, 'brand' | 'last4' | 'wallet'>;

export const cardOf = ({ brand, last4, wallet }: HeldCard): HeldCard => ({ brand, last4, wallet });

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
  /** When the hold of a Fare being paid again was placed. */
  retriedAtMs: number | null;
  /** That of the newest hold. */
  card: HeldCard | null;
  /** What the Fare of the Ride travelled is made of, once it is due. It comes to more than `chargeCents` if the charge was limited to the quoted Fare. */
  breakdown: FareBreakdown | null;
}

export type RidePaymentChanges = Partial<Pick<RidePayment, 'rideRequestId' | 'holdRef' | 'status' | 'trip' | 'chargeCents' | 'settledAtMs' | 'retriedAtMs' | 'card' | 'breakdown'>>;

/** Those still with money held, or about to have. */
export const OPEN_STATUSES: readonly RidePaymentStatus[] = ['pending', 'held', 'charging', 'releasing', 'retrying'];

export abstract class RidePaymentRepository {
  abstract add(payment: RidePayment): Promise<void>;
  /** Changes a payment, but only if it is still `from`, and says whether it was. */
  abstract update(id: string, changes: RidePaymentChanges, from: RidePaymentStatus): Promise<boolean>;
  abstract find(accountId: string, id: string): Promise<RidePayment | null>;
  /** The newest of those given to a Ride Request. */
  abstract findLatest(accountId: string, rideRequestId: string): Promise<RidePayment | null>;
  abstract findOpen(accountId: string): Promise<RidePayment[]>;
  /** Those whose Fare is still due, oldest first. */
  abstract findUnpaid(accountId: string): Promise<RidePayment[]>;
  /** Up to `limit` of those paid that have a receipt, newest Ride first, carrying on from the payment `after` if there is one. */
  abstract findReceipted(accountId: string, limit: number, after: string | null): Promise<RidePayment[]>;
  abstract countReceipted(accountId: string): Promise<number>;
  abstract findAccountsWithOpen(): Promise<string[]>;
}
