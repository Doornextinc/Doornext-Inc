-- Migration 031: automatic stale-driver-assignment release
--
-- If a driver accepts an order then goes offline (crash / airplane mode / rage-quit)
-- the order would be stuck at driver_assigned forever.  This migration provides:
--   1. A PL/pgSQL function that releases assignments where the driver hasn't
--      pinged their heartbeat within a configurable grace period.
--   2. An app_settings seed row so the grace period is tunable from the admin UI.
--
-- The function is called by a periodic cron job via the admin endpoint
-- POST /api/admin/cron/release-stale-assignments (protected by CRON_SECRET).

-- Grace period in seconds — default 90s (1.5 × the 60s max heartbeat interval)
INSERT INTO public.app_settings (key, value)
VALUES ('stale_driver_grace_seconds', '90')
ON CONFLICT (key) DO NOTHING;

-- ── Release function ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_stale_driver_assignments()
RETURNS TABLE (released_order_id UUID, stale_driver_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grace_sec INTEGER;
BEGIN
  SELECT COALESCE(value::INTEGER, 90)
    INTO grace_sec
    FROM public.app_settings
   WHERE key = 'stale_driver_grace_seconds';

  RETURN QUERY
    UPDATE public.orders
       SET status       = 'ready',
           nexter_id    = NULL,
           pickup_pin   = NULL,
           pin_attempts = 0,
           updated_at   = now()
     WHERE status    = 'driver_assigned'
       AND nexter_id IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM public.driver_profiles dp
          WHERE dp.id = orders.nexter_id
            AND (
              dp.last_seen_at IS NULL
              OR dp.last_seen_at < now() - (grace_sec || ' seconds')::INTERVAL
            )
       )
  RETURNING id AS released_order_id, nexter_id AS stale_driver_id;
END;
$$;

COMMENT ON FUNCTION public.release_stale_driver_assignments() IS
  'Re-opens driver_assigned orders whose driver heartbeat has gone stale. '
  'Safe to call repeatedly — idempotent. Returns the set of (order_id, driver_id) pairs released.';

-- ── Order expiry for orders stuck at ready with no driver ───────────────────
-- An optional expiry timestamp so the operations team can see long-pending orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ready_since TIMESTAMPTZ;

-- Automatically stamp ready_since when status transitions to ready
CREATE OR REPLACE FUNCTION public.stamp_ready_since()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ready' AND (OLD.status IS DISTINCT FROM 'ready') THEN
    NEW.ready_since = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_ready_since ON public.orders;
CREATE TRIGGER trg_stamp_ready_since
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_ready_since();
