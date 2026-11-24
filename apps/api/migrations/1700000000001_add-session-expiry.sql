-- Up Migration
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days';
ALTER TABLE sessions ALTER COLUMN expires_at DROP DEFAULT;

-- Down Migration
ALTER TABLE sessions DROP COLUMN expires_at;
