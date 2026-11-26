-- Up Migration
CREATE TABLE payment_customers (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  stripe_customer_ref text NOT NULL UNIQUE
);

CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES payment_customers(account_id),
  stripe_method_ref text NOT NULL UNIQUE,
  brand text NOT NULL,
  last4 text NOT NULL,
  wallet text CHECK (wallet IN ('apple_pay', 'google_pay')),
  created_order bigint GENERATED ALWAYS AS IDENTITY
);

CREATE INDEX payment_methods_account_id ON payment_methods (account_id);

ALTER TABLE payment_customers
  ADD COLUMN default_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE payment_customers DROP COLUMN default_method_id;
DROP TABLE payment_methods;
DROP TABLE payment_customers;
