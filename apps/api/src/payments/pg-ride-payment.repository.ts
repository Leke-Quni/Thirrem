import { Injectable } from '@nestjs/common';
import type { VehicleType } from '@thirrem/types';
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
}

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
});

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));

/** The columns a change sets. */
function columns({ rideRequestId, holdRef, status, trip, chargeCents, settledAtMs }: RidePaymentChanges): Array<[string, unknown]> {
  const all: Array<[string, unknown]> = [
    ['ride_request_id', rideRequestId],
    ['stripe_intent_ref', holdRef],
    ['status', status],
    ['distance_m', trip?.distanceM],
    ['duration_s', trip?.durationS],
    ['charge_cents', chargeCents],
    ['settled_at', settledAtMs === undefined ? undefined : toDate(settledAtMs)],
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
      `INSERT INTO ride_payments (id, account_id, ride_request_id, stripe_intent_ref, status, vehicle_type, pickup_name, dropoff_name, distance_m, duration_s, held_cents, charge_cents, requested_at, settled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [payment.id, payment.accountId, payment.rideRequestId, payment.holdRef, payment.status, payment.vehicleType, payment.pickupName, payment.dropoffName, payment.trip.distanceM, payment.trip.durationS, payment.heldCents, payment.chargeCents, toDate(payment.requestedAtMs), toDate(payment.settledAtMs)],
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

  async findOpen(accountId: string): Promise<RidePayment[]> {
    const { rows } = await this.database.query<RidePaymentRow>('SELECT * FROM ride_payments WHERE account_id = $1 AND status = ANY($2) ORDER BY requested_at', [accountId, OPEN_STATUSES]);
    return rows.map(toPayment);
  }

  async findAccountsWithOpen(): Promise<string[]> {
    const { rows } = await this.database.query<{ account_id: string }>('SELECT DISTINCT account_id FROM ride_payments WHERE status = ANY($1)', [OPEN_STATUSES]);
    return rows.map((row) => row.account_id);
  }
}
