import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Receipt, ReceiptsResponse } from '@thirrem/types';
import { breakdownTotal } from '../fares/fare-calculator.js';
import { isPaymentId } from '../payments/payment-refusal.js';
import { type RidePayment, RidePaymentRepository } from '../payments/ride-payment.repository.js';
import { UnpaidFareService } from './unpaid-fare.service.js';

const PAGE_SIZE = 6;

/** The receipt of a payment, or null if it has none: it is not paid, or was paid before what a receipt shows was kept. */
function toReceipt({ id, rideRequestId, status, chargeCents, vehicleType, pickupName, dropoffName, requestedAtMs, trip, breakdown, card }: RidePayment): Receipt | null {
  if (status !== 'charged' || !breakdown || !card) return null;
  return {
    id,
    rideId: rideRequestId!,
    amountCents: chargeCents!,
    currency: 'EUR',
    requestedAt: new Date(requestedAtMs).toISOString(),
    vehicleType,
    pickupName,
    dropoffName,
    distanceM: trip.distanceM,
    durationS: trip.durationS,
    breakdown,
    adjustmentCents: chargeCents! - breakdownTotal(breakdown),
    paymentMethod: card,
  };
}

/** What a Rider has paid for their Rides. */
@Injectable()
export class ReceiptService {
  constructor(
    private readonly payments: RidePaymentRepository,
    private readonly unpaidFares: UnpaidFareService,
  ) {}

  /** A page of them, newest Ride first, carrying on after the receipt `after` if there is one. */
  async list(accountId: string, after?: unknown): Promise<ReceiptsResponse> {
    if (after !== undefined && !isPaymentId(after)) throw new BadRequestException('There is no such receipt to carry on from.');
    // Only the first page can gain from it, as the rest are older.
    if (after === undefined) await this.unpaidFares.bringUpToDate(accountId);
    // One more than a page tells whether there is another.
    const found = await this.payments.findReceipted(accountId, PAGE_SIZE + 1, after ?? null);
    const receipts = found.slice(0, PAGE_SIZE).map((payment) => toReceipt(payment)!);
    // A receipt that is not this Rider's leads to nothing, and so does their count with it.
    const unknown = after !== undefined && !(await this.payments.find(accountId, after));
    const total = unknown ? 0 : await this.payments.countReceipted(accountId);
    return { receipts, total, next: found.length > PAGE_SIZE ? receipts.at(-1)!.id : null };
  }

  async find(accountId: string, id: string): Promise<Receipt> {
    await this.unpaidFares.bringUpToDate(accountId);
    const payment = isPaymentId(id) ? await this.payments.find(accountId, id) : null;
    const receipt = payment && toReceipt(payment);
    if (!receipt) throw new NotFoundException('There is no such receipt.');
    return receipt;
  }
}
