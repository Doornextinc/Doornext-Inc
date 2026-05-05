-- ============================================================
-- 044: Fix release_stale_driver_assignments() return value
--
-- Bug: The function used RETURNING nexter_id AS stale_driver_id
-- after setting nexter_id = NULL. PostgreSQL's RETURNING clause
-- returns updated values, so stale_driver_id was always NULL,
-- making it impossible to trace which driver went stale.
--
-- Fix: CTE that captures original nexter_id BEFORE the UPDATE.
-- Also adds a driver_reliability_events table for audit history.
-- ============================================================

-- 1. Reliability events table (append-only, idempotent creation)
CREATE TABLE IF NOT EXISTS public.driver_reliability_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      UUID        NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  order_id       UUID        NOT NULL REFERENCES public.orders(id)          ON DELETE CASCADE,
  event_type     TEXT        NOT NULL DEFAULT 'stale_assignment',
  grace_seconds  INTEGER,
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, order_id, event_type)  -- one record per driver+order+type
);

CREATE INDEX IF NOT EXISTS idx_driver_reliability_events_driver
  ON public.driver_reliability_events (driver_id, triggered_at DESC);

COMMENT ON TABLE public.driver_reliability_events IS
  'Append-only log of driver reliability incidents (stale assignments, missed pickups, etc.)';

-- 2. Replace the function, using a CTE to preserve old nexter_id before nulling it
CREATE OR REPLACE FUNCTION public.release_stale_driver_assignments()
RETURNS TABLE (released_order_id UUID, stale_driver_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grace_sec INTEGER;
BEGIN
  -- Load configurable grace period (falls back to 90 s if setting is absent)
  SELECT COALESCE(value::INTEGER, 90)
    INTO grace_sec
    FROM public.settings
   WHERE key = 'stale_driver_grace_seconds';

  grace_sec := COALESCE(grace_sec, 90);

  -- CTE: identify stale orders (capturing original nexter_id) then update in one statement.
  -- FOR UPDATE SKIP LOCKED ensures concurrent cron calls don't double-release.
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
    RETURNING public.orders.id, eligible.old_nexter_id
  )
  SELECT id AS released_order_id, old_nexter_id AS stale_driver_id
    FROM updated;

  -- Record reliability events for traceability (ignore duplicates)
  INSERT INTO public.driver_reliability_events (driver_id, order_id, event_type, grace_seconds)
  SELECT stale_driver_id, released_order_id, 'stale_assignment', grace_sec
    FROM _stale_release_results
  ON CONFLICT (driver_id, order_id, event_type) DO NOTHING;

  -- Return results to caller
  RETURN QUERY SELECT released_order_id, stale_driver_id FROM _stale_release_results;
END;
$$;

COMMENT ON FUNCTION public.release_stale_driver_assignments() IS
  'Re-opens stuck driver orders whose driver heartbeat has gone stale. '
  'Returns (released_order_id, stale_driver_id) — stale_driver_id is NEVER null. '
  'Covers driver_assigned, arrived_at_maker, picked_up, on_the_way. '
  'Reads grace period from public.settings.stale_driver_grace_seconds. '
  'Uses FOR UPDATE SKIP LOCKED — safe for concurrent cron invocations. '
  'Records driver_reliability_events rows for per-driver stale history.';
