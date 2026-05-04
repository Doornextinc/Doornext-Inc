-- ============================================================
-- 041: Concurrency hardening
--
-- 1. UNIQUE constraint on stripe_processed_events.event_id
--    (webhook idempotency check was never actually firing)
-- 2. Terminal-state guard trigger on orders
--    (delivered/cancelled/failed_delivery cannot be overwritten)
-- 3. FK orders.nexter_id → driver_profiles.id ON DELETE SET NULL
-- 4. Performance indexes for dispatch hot-path queries
-- ============================================================

-- ── 1. Stripe webhook idempotency ─────────────────────────────────────────────
-- The existing code catches error code 23505 (unique_violation) to deduplicate
-- webhook events, but that check was silently a no-op because no UNIQUE constraint
-- existed on event_id — only a non-unique index on processed_at.
ALTER TABLE public.stripe_processed_events
  ADD CONSTRAINT stripe_processed_events_event_id_key UNIQUE (event_id);


-- ── 2. Terminal-state guard ────────────────────────────────────────────────────
-- Prevents any UPDATE to orders.status once the order reaches a terminal state.
-- This fires in the DB regardless of which service, API route, or RPC touches the row.
CREATE OR REPLACE FUNCTION public.guard_terminal_order_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('delivered', 'cancelled', 'failed_delivery') THEN
    RAISE EXCEPTION
      'order % is in terminal state "%" and its status cannot be changed',
      OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_terminal_order_status ON public.orders;
CREATE TRIGGER trg_guard_terminal_order_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_terminal_order_status();


-- ── 3. FK orders.nexter_id → driver_profiles ──────────────────────────────────
-- Ensures referential integrity between assigned driver and their profile.
-- NOT VALID avoids a full table scan on migration; VALIDATE runs a deferred check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'orders'
      AND constraint_name = 'orders_nexter_id_driver_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_nexter_id_driver_fkey
      FOREIGN KEY (nexter_id)
      REFERENCES public.driver_profiles(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_nexter_id_driver_fkey;


-- ── 4. Dispatch hot-path indexes ──────────────────────────────────────────────
-- Orders awaiting driver pickup (shown on the driver app browse screen)
CREATE INDEX IF NOT EXISTS idx_orders_ready
  ON public.orders (maker_id, created_at DESC)
  WHERE status = 'ready';

-- Orders being prepared (used for nearby-driver notifications)
CREATE INDEX IF NOT EXISTS idx_orders_preparing
  ON public.orders (maker_id, created_at DESC)
  WHERE status = 'preparing';

-- Driver assignment lookup (used in stale-assignment sweeper and accept-order)
CREATE INDEX IF NOT EXISTS idx_orders_nexter_active
  ON public.orders (nexter_id, status)
  WHERE nexter_id IS NOT NULL
    AND status NOT IN ('delivered', 'cancelled', 'failed_delivery');
