import { Injectable } from '@nestjs/common';
import type { VehicleType, Wallet } from '@thirrem/types';
import { DatabaseService } from '../database/database.service.js';
import { OPEN_STATUSES, type RidePayment, type RidePaymentChanges, RidePaymentRepository, type RidePaymentStatus } from './ride-payment.repository.js';

interface RidePaymentRow {
  id: string;
  account_id: string;
  ride_request_id: string | null;
  stripe_intent_ref: string | null;
  status: RidePaymentStatus;
  vehicle_type: VehicleType;
  pickup_name: string;
  dropoff_name: string;
  distance_m: number;
  duration_s: number;
  held_cents: number;
  charge_cents: number | null;
  requested_at: Date;
  settled_at: Date | null;
  retried_at: Date | null;
  card_brand: string | null;
  card_last4: string | null;
  card_wallet: Wallet | null;
  base_cents: number | null;
  distance_cents: number | null;
  time_cents: number | null;
  long_distance_cents: number | null;
}

// The columns of each are written together, so one of them says whether all are there.
const toCard = ({ card_brand: brand, card_last4: last4, card_wallet: wallet }: RidePaymentRow) => (brand === null ? null : { brand, last4: last4!, wallet });

const toBreakdown = ({ base_cents: baseCents, distance_cents, time_cents, long_distance_cents }: RidePaymentRow) =>
  baseCents === null ? null : { baseCents, distanceCents: distance_cents!, timeCents: time_cents!, longDistanceCents: long_distance_cents! };

const toPayment = (row: RidePaymentRow): RidePayment => ({
  id: row.id,
  accountId: row.account_id,
  rideRequestId: row.ride_request_id,
  holdRef: row.stripe_intent_ref,
  status: row.status,
  vehicleType: row.vehicle_type,
  pickupName: row.pickup_name,
  dropoffName: row.dropoff_name,
  trip: { distanceM: row.distance_m, durationS: row.duration_s },
  heldCents: row.held_cents,
  chargeCents: row.charge_cents,
  requestedAtMs: row.requested_at.getTime(),
  settledAtMs: row.settled_at?.getTime() ?? null,
  retriedAtMs: row.retried_at?.getTime() ?? null,
  card: toCard(row),
  breakdown: toBreakdown(row),
});

/** Paid, with what a receipt shows. Payments charged before that was kept have none. */
const RECEIPTED = `status = 'charged' AND base_cents IS NOT NULL AND card_brand IS NOT NULL`;

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));

/** The columns a change sets. */
function columns({ rideRequestId, holdRef, status, trip, chargeCents, settledAtMs, retriedAtMs, card, breakdown }: RidePaymentChanges): Array<[string, unknown]> {
  const all: Array<[string, unknown]> = [
    ['ride_request_id', rideRequestId],
    ['stripe_intent_ref', holdRef],
    ['status', status],
    ['distance_m', trip?.distanceM],
    ['duration_s', trip?.durationS],
    ['charge_cents', chargeCents],
    ['settled_at', settledAtMs === undefined ? undefined : toDate(settledAtMs)],
    ['retried_at', retriedAtMs === undefined ? undefined : toDate(retriedAtMs)],
    ['card_brand', card?.brand],
    ['card_last4', card?.last4],
    ['card_wallet', card?.wallet],
    ['base_cents', breakdown?.baseCents],
    ['distance_cents', breakdown?.distanceCents],
    ['time_cents', breakdown?.timeCents],
    ['long_distance_cents', breakdown?.longDistanceCents],
  ];
  return all.filter(([, value]) => value !== undefined);
}

@Injectable()
export class PgRidePaymentRepository extends RidePaymentRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async add(payment: RidePayment): Promise<void> {
    await this.database.query(
      `INSERT INTO ride_payments (id, account_id, ride_request_id, stripe_intent_ref, status, vehicle_type, pickup_name, dropoff_name, distance_m, duration_s, held_cents, charge_cents, requested_at, settled_at, card_brand, card_last4, card_wallet)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [payment.id, payment.accountId, payment.rideRequestId, payment.holdRef, payment.status, payment.vehicleType, payment.pickupName, payment.dropoffName, payment.trip.distanceM, payment.trip.durationS, payment.heldCents, payment.chargeCents, toDate(payment.requestedAtMs), toDate(payment.settledAtMs), payment.card?.brand, payment.card?.last4, payment.card?.wallet],
    );
  }

  async update(id: string, changes: RidePaymentChanges, from: RidePaymentStatus): Promise<boolean> {
    const set = columns(changes);
    const assignments = set.map(([column], index) => `${column} = $${index + 3}`).join(', ');
    const { rowCount } = await this.database.query(`UPDATE ride_payments SET ${assignments} WHERE id = $1 AND status = $2`, [id, from, ...set.map(([, value]) => value)]);
    return rowCount === 1;
  }

  async find(accountId: string, id: string): Promise<RidePayment | null> {
    const { rows } = await this.database.query<RidePaymentRow>('SELECT * FROM ride_payments WHERE account_id = $1 AND id = $2', [accountId, id]);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async findLatest(accountId: string, rideRequestId: string): Promise<RidePayment | null> {
    const { rows } = await this.database.query<RidePaymentRow>('SELECT * FROM ride_payments WHERE account_id = $1 AND ride_request_id = $2 ORDER BY requested_at DESC LIMIT 1', [accountId, rideRequestId]);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  findOpen(accountId: string): Promise<RidePayment[]> {
    return this.findByStatus(accountId, OPEN_STATUSES);
  }

  findUnpaid(accountId: string): Promise<RidePayment[]> {
    return this.findByStatus(accountId, ['unpaid', 'retrying']);
  }

  async findReceipted(accountId: string, limit: number, after: string | null): Promise<RidePayment[]> {
    // Rides requested at once are told apart by id, so that none is lost between two lots.
    const { rows } = await this.database.query<RidePaymentRow>(
      `SELECT * FROM ride_payments WHERE account_id = $1 AND ${RECEIPTED}
         AND ($3::uuid IS NULL OR (requested_at, id) < (SELECT requested_at, id FROM ride_payments WHERE account_id = $1 AND id = $3))
       ORDER BY requested_at DESC, id DESC LIMIT $2`,
      [accountId, limit, after],
    );
    return rows.map(toPayment);
  }

  async countReceipted(accountId: string): Promise<number> {
    const { rows } = await this.database.query<{ count: number }>(`SELECT count(*)::int AS count FROM ride_payments WHERE account_id = $1 AND ${RECEIPTED}`, [accountId]);
    return rows[0]!.count;
  }

  async findAccountsWithOpen(): Promise<string[]> {
    const { rows } = await this.database.query<{ account_id: string }>('SELECT DISTINCT account_id FROM ride_payments WHERE status = ANY($1)', [OPEN_STATUSES]);
    return rows.map((row) => row.account_id);
  }

  private async findByStatus(accountId: string, statuses: readonly RidePaymentStatus[]): Promise<RidePayment[]> {
    const { rows } = await this.database.query<RidePaymentRow>('SELECT * FROM ride_payments WHERE account_id = $1 AND status = ANY($2) ORDER BY requested_at', [accountId, statuses]);
    return rows.map(toPayment);
  }
}
