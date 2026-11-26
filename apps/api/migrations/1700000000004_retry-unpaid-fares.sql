-- Up Migration
ALTER TABLE ride_payments ADD COLUMN retried_at timestamptz;
ALTER TABLE ride_payments DROP CONSTRAINT ride_payments_status_check;
ALTER TABLE ride_payments ADD CONSTRAINT ride_payments_status_check CHECK (status IN ('pending', 'held', 'declined', 'charging', 'charged', 'releasing', 'released', 'unpaid', 'retrying'));

DROP INDEX ride_payments_open;
CREATE INDEX ride_payments_open ON ride_payments (account_id) WHERE status IN ('pending', 'held', 'charging', 'releasing', 'retrying');

-- Down Migration
DROP INDEX ride_payments_open;
UPDATE ride_payments SET status = 'unpaid' WHERE status = 'retrying';
ALTER TABLE ride_payments DROP CONSTRAINT ride_payments_status_check;
ALTER TABLE ride_payments ADD CONSTRAINT ride_payments_status_check CHECK (status IN ('pending', 'held', 'declined', 'charging', 'charged', 'releasing', 'released', 'unpaid'));
ALTER TABLE ride_payments DROP COLUMN retried_at;
CREATE INDEX ride_payments_open ON ride_payments (account_id) WHERE status IN ('pending', 'held', 'charging', 'releasing');
