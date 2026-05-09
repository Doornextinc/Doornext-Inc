-- Migration 059: Add nexter_id guard to release_stale_driver_assignments.
--
-- Audit finding 2.7 — between the SELECT into `eligible` and the final UPDATE
-- there's a window where a driver can accept a *different* order. Without a
-- nexter_id guard on the UPDATE, that newly-accepted assignment could be
-- nulled out as collateral damage.
--
-- The fix: also match on `nexter_id = eligible.old_nexter_id` so we only
-- release the assignment that was actually flagged stale. The FOR UPDATE
-- SKIP LOCKED in the CTE narrows the race, but row-level locks don't survive
-- the boundary between the CTE rows and the UPDATE statement under all
-- isolation levels — explicit guarding is safer.

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

  grace_sec := COALESCE(grace_sec, 90);

  CREATE TEMP TABLE IF NOT EXISTS _stale_release_results (
    released_order_id UUID,
    stale_driver_id   UUID
  ) ON COMMIT DELETE ROWS;

  INSERT INTO _stale_release_results (released_order_id, stale_driver_id)
  WITH eligible AS (
    SELECT o.id        AS order_id,
           o.nexter_id AS old_nexter_id
      FROM public.orders o
      JOIN public.driver_profiles dp ON dp.id = o.nexter_id
     WHERE o.status IN ('driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way')
       AND o.nexter_id IS NOT NULL
       AND (
         dp.last_seen_at IS NULL
         OR dp.last_seen_at < now() - (grace_sec || ' seconds')::INTERVAL
       )
    FOR UPDATE OF o SKIP LOCKED
  ),
  updated AS (
    UPDATE public.orders
       SET status       = 'ready',
           nexter_id    = NULL,
           pickup_pin   = NULL,
           pin_attempts = 0,
           updated_at   = now()
      FROM eligible
     WHERE public.orders.id = eligible.order_id
       -- NEW: only null out the *exact* assignment we flagged stale.
       -- Without this guard, a driver who accepted a different order between
       -- the SELECT and the UPDATE could lose their new assignment.
       AND public.orders.nexter_id = eligible.old_nexter_id
       -- NEW: belt-and-braces — never write 'ready' over a terminal status.
       AND public.orders.status IN ('driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way')
    RETURNING public.orders.id, eligible.old_nexter_id
  )
  SELECT id AS released_order_id, old_nexter_id AS stale_driver_id
    FROM updated;

  INSERT INTO public.driver_reliability_events (driver_id, order_id, event_type, grace_seconds)
  SELECT stale_driver_id, released_order_id, 'stale_assignment', grace_sec
    FROM _stale_release_results
  ON CONFLICT (driver_id, order_id, event_type) DO NOTHING;

  RETURN QUERY SELECT released_order_id, stale_driver_id FROM _stale_release_results;
END;
$$;
