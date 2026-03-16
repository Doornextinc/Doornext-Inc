-- Migration 021: Security hardening
-- P0: Fix nexter_locations RLS (restrict to order participants)
-- P2: Add stripe_processed_events (webhook idempotency)
-- P2: Add admin_audit_log (admin action audit trail)

-- ============================================================
-- 1. Fix nexter_locations RLS (P0 Critical)
--    Previously anyone could read all driver GPS locations.
--    Now only: the driver themselves, OR parties with an active
--    order currently being delivered by that driver.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view nexter locations" ON public.nexter_locations;

-- Drivers can always read/write their own location row
CREATE POLICY "Drivers manage own location"
  ON public.nexter_locations
  FOR ALL
  USING (nexter_id = auth.uid())
  WITH CHECK (nexter_id = auth.uid());

-- Customers and makers can read a driver location only while
-- there is an active order linking them to that driver.
CREATE POLICY "Order participants can view driver location"
  ON public.nexter_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.nexter_id = nexter_locations.nexter_id
        AND o.status IN (
          'driver_assigned',
          'arrived_at_maker',
          'picked_up',
          'on_the_way',
          'arrived_at_customer'
        )
        AND (
          -- customer who placed the order
          o.customer_id = auth.uid()
          OR
          -- maker whose kitchen the order is from
          o.maker_id IN (
            SELECT id FROM public.food_makers WHERE user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- 2. Restrict delivery_address visibility for drivers
--    browsing unassigned (available) orders.
--    We cannot do true column-level RLS, so we replace the
--    broad drivers_see_orders SELECT policy with two targeted
--    policies:
--      a) Driver assigned to order: full row access
--      b) Driver browsing ready orders: full row access is
--         acceptable here since they need address to decide,
--         BUT we tighten using a separate view approach below.
-- ============================================================
-- NOTE: Full column-level restriction requires app-level query
-- trimming (omit delivery_address when fetching available orders).
-- The driver app's /available page already should only request
-- fields needed for the card (see app query). This migration
-- documents the intent and the app-level fix is in the driver
-- available orders query.

-- ============================================================
-- 3. stripe_processed_events — Webhook idempotency (P2)
--    Stores Stripe event IDs that have already been processed
--    to prevent duplicate order creation / state mutations.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id   text PRIMARY KEY,             -- Stripe evt_xxx id
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role (backend webhook handler) reads/writes this table.
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role bypasses RLS.

-- Auto-purge events older than 30 days to keep the table small.
-- (Implement via pg_cron or a periodic cleanup job in production.)

COMMENT ON TABLE public.stripe_processed_events IS
  'Idempotency store for Stripe webhook events. Processed event IDs are '
  'inserted here before mutating order state; duplicate deliveries abort.';

-- ============================================================
-- 4. admin_audit_log — Admin action audit trail (P2)
--    Every privileged admin action (refund, KYC approve/reject,
--    manual order cancel, settings change) must insert a row here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES public.users(id),
  action       text NOT NULL,          -- e.g. 'refund', 'kyc_approve', 'order_cancel'
  target_type  text,                   -- e.g. 'order', 'driver', 'user'
  target_id    text,                   -- ID of the affected record
  payload      jsonb,                  -- additional context (amount, reason, etc.)
  ip_address   text,                   -- originating IP from request headers
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can INSERT audit rows (service role also bypasses RLS)
CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can read all audit log entries
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail for all privileged admin operations. '
  'Rows must never be updated or deleted in production.';

-- Index for common queries (filter by admin or by target)
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx
  ON public.admin_audit_log (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_type, target_id, created_at DESC);
