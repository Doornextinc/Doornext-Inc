-- ============================================================
-- 038: Fix stale driver assignment release
--
-- Two problems addressed:
--
-- 1. settings table mismatch
--    Migration 031 seeded stale_driver_grace_seconds into app_settings,
--    but the admin UI reads/writes from the settings table. This meant
--    admin changes to the grace period had no effect. We migrate the
--    value to settings and update the function to read from there.
--
-- 2. Only driver_assigned was handled
--    Orders that advance past driver_assigned (arrived_at_maker,
--    on_the_way, picked_up) can also go permanently stuck if the
--    driver goes offline. The updated function releases all of these
--    back to ready so dispatching can retry.
-- ============================================================

-- 1. Ensure the grace period setting exists in the settings table
INSERT INTO public.settings (key, value)
VALUES ('stale_driver_grace_seconds', '90')
ON CONFLICT (key) DO NOTHING;

-- 2. Replace the function to read from settings and cover all mid-delivery statuses
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
    FROM public.settings
   WHERE key = 'stale_driver_grace_seconds';

  -- Fall back to 90 s if the setting row is missing
  grace_sec := COALESCE(grace_sec, 90);

  -- Release orders stuck at any in-transit driver status.
  -- Statuses covered:
  --   driver_assigned   – driver accepted but never moved
  --   arrived_at_maker  – driver arrived but never picked up
  --   picked_up         – driver picked up but never delivered
  --   on_the_way        – driver en route but went offline
  RETURN QUERY
    UPDATE public.orders
       SET status       = 'ready',
           nexter_id    = NULL,
           pickup_pin   = NULL,
           pin_attempts = 0,
           updated_at   = now()
     WHERE status IN ('driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way')
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
  'Re-opens stuck driver orders whose driver heartbeat has gone stale. '
  'Covers driver_assigned, arrived_at_maker, picked_up, on_the_way. '
  'Reads grace period from public.settings.stale_driver_grace_seconds. '
  'Safe to call repeatedly — idempotent.';
