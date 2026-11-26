-- Up Migration
CREATE TABLE driver_vehicles (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  vehicle_type text NOT NULL,
  model text NOT NULL,
  colour text NOT NULL,
  plate text NOT NULL,
  submitted_at timestamptz NOT NULL
);

-- Down Migration
DROP TABLE driver_vehicles;
