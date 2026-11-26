-- Up Migration
ALTER TABLE ride_payments
  ADD COLUMN card_brand text,
  ADD COLUMN card_last4 text,
  ADD COLUMN card_wallet text CHECK (card_wallet IN ('apple_pay', 'google_pay')),
  ADD COLUMN base_cents integer,
  ADD COLUMN distance_cents integer,
  ADD COLUMN time_cents integer,
  ADD COLUMN long_distance_cents integer;

CREATE INDEX ride_payments_charged ON ride_payments (account_id, requested_at) WHERE status = 'charged';

-- Down Migration
DROP INDEX ride_payments_charged;
ALTER TABLE ride_payments
  DROP COLUMN card_brand,
  DROP COLUMN card_last4,
  DROP COLUMN card_wallet,
  DROP COLUMN base_cents,
  DROP COLUMN distance_cents,
  DROP COLUMN time_cents,
  DROP COLUMN long_distance_cents;
