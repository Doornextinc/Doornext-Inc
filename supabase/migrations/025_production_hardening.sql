-- ============================================================
-- Migration 025: Production Hardening
-- Adds missing indexes, tightens RLS, and adds operational
-- improvements for production-grade performance and security.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PERFORMANCE: Missing composite indexes on hot query paths
-- ────────────────────────────────────────────────────────────

-- Orders: driver dashboard queries (available orders by status + created_at)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

-- Orders: customer order history
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC);

-- Orders: maker dashboard
CREATE INDEX IF NOT EXISTS idx_orders_maker_status
  ON public.orders (maker_id, status, created_at DESC);

-- Orders: driver active orders
CREATE INDEX IF NOT EXISTS idx_orders_nexter_status
  ON public.orders (nexter_id, status)
  WHERE nexter_id IS NOT NULL;

-- Notifications: unread count query
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, read, created_at DESC);

-- Menu items: maker menu page
CREATE INDEX IF NOT EXISTS idx_menu_items_maker_available
  ON public.menu_items (maker_id, is_available, category);

-- Food makers: geo search (lat/lng range queries)
CREATE INDEX IF NOT EXISTS idx_food_makers_open_geo
  ON public.food_makers (is_open, lat, lng)
  WHERE is_open = true;

-- Driver profiles: active drivers for dispatch
CREATE INDEX IF NOT EXISTS idx_driver_profiles_active
  ON public.driver_profiles (is_active, kyc_status)
  WHERE is_active = true;

-- Stripe processed events: TTL cleanup support
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON public.stripe_processed_events (processed_at);

-- ────────────────────────────────────────────────────────────
-- 2. SECURITY: Stripe processed events — service role only
-- ────────────────────────────────────────────────────────────

-- Ensure no public access to stripe_processed_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stripe_processed_events'
      AND policyname = 'No public access'
  ) THEN
    CREATE POLICY "No public access"
      ON public.stripe_processed_events
      FOR ALL
      USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. SECURITY: Admin audit log — ensure service role only
-- ────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_audit_log'
      AND policyname = 'Admins can view audit log'
  ) THEN
    CREATE POLICY "Admins can view audit log"
      ON public.admin_audit_log
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. DATA INTEGRITY: Prevent negative financial values
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD CONSTRAINT IF NOT EXISTS chk_orders_subtotal_positive
    CHECK (subtotal >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_total_positive
    CHECK (total >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_delivery_fee_positive
    CHECK (delivery_fee >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_tip_positive
    CHECK (tip_amount >= 0);

ALTER TABLE public.menu_items
  ADD CONSTRAINT IF NOT EXISTS chk_menu_items_price_positive
    CHECK (price > 0);

-- ────────────────────────────────────────────────────────────
-- 5. OPERATIONAL: Stripe processed events TTL cleanup function
-- Removes events older than 90 days to prevent unbounded growth.
-- Schedule via pg_cron or Supabase Edge Function cron.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_stripe_processed_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.stripe_processed_events
  WHERE processed_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. OPERATIONAL: Order status transition audit trigger
-- Logs every order status change to admin_audit_log for
-- debugging and dispute resolution.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.admin_audit_log (
      admin_id,
      action,
      target_type,
      target_id,
      payload,
      ip_address
    ) VALUES (
      NEW.nexter_id,  -- actor (driver, or null for system/webhook)
      'order_status_change',
      'order',
      NEW.id::text,
      jsonb_build_object(
        'from', OLD.status::text,
        'to', NEW.status::text,
        'customer_id', NEW.customer_id,
        'maker_id', NEW.maker_id
      ),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_audit ON public.orders;
CREATE TRIGGER trg_order_status_audit
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_change();

-- ────────────────────────────────────────────────────────────
-- 7. SECURITY: Tighten notifications RLS
-- Ensure users can only read/update their own notifications.
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications'
      AND policyname = 'Users can mark own notifications read'
  ) THEN
    CREATE POLICY "Users can mark own notifications read"
      ON public.notifications
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
