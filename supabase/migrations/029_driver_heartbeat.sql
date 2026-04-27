-- Migration 029: driver heartbeat
-- Adds last_seen_at to driver_profiles so the admin dashboard and
-- dispatcher can tell which drivers are actively online right now.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index for fast "online in last N minutes" queries
CREATE INDEX IF NOT EXISTS idx_driver_profiles_last_seen_at
  ON driver_profiles (last_seen_at DESC NULLS LAST);

-- Comment for clarity
COMMENT ON COLUMN driver_profiles.last_seen_at IS
  'Timestamp of the most recent heartbeat ping from the driver app. '
  'NULL means the driver has never pinged (or data pre-dates this column). '
  'Updated every ~2 minutes while the driver app is open.';
