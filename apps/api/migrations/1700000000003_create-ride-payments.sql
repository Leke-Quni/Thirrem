-- Up Migration
CREATE TABLE ride_payments (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  ride_request_id uuid,
  stripe_intent_ref text UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'held', 'declined', 'charging', 'charged', 'releasing', 'released', 'unpaid')),
  vehicle_type text NOT NULL,
  pickup_name text NOT NULL,
  dropoff_name text NOT NULL,
  distance_m double precision NOT NULL,
  duration_s double precision NOT NULL,
  held_cents integer NOT NULL,
  charge_cents integer CHECK (charge_cents <= held_cents),
  requested_at timestamptz NOT NULL,
  settled_at timestamptz
);

CREATE INDEX ride_payments_open ON ride_payments (account_id) WHERE status IN ('pending', 'held', 'charging', 'releasing');

-- Down Migration
DROP TABLE ride_payments;
