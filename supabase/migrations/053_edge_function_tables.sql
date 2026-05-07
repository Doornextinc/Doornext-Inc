-- ============================================================
-- 053: Tables and columns required by the business-logic,
--      check-license-expiry, and notify-license-status
--      Supabase Edge Functions.
--
-- New additions:
--   orders.pickup_pin_attempts  — alias-compatible column name expected by edge fn
--   orders.pin_locked_until     — lockout timestamp after 5 bad PIN attempts
--   orders.order_group_id       — groups stacked orders assigned to same driver
--   api_rate_limits             — per-user rate-limit tracking for edge functions
--   flash_offers                — driver flash bonus zones (DoorDash-style)
--   driver_flash_claims         — records which drivers claimed which flash offers
--   seller_licenses             — business license uploads for maker verification
-- ============================================================

-- ── 1. orders: new PIN & grouping columns ─────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_pin_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until    timestamptz,
  ADD COLUMN IF NOT EXISTS order_group_id      uuid;

-- Sync any existing pin_attempts data into pickup_pin_attempts
UPDATE public.orders SET pickup_pin_attempts = pin_attempts WHERE pin_attempts > 0;

COMMENT ON COLUMN public.orders.pickup_pin_attempts IS
  'Number of failed PIN attempts; mirrors pin_attempts — used by edge functions';
COMMENT ON COLUMN public.orders.pin_locked_until IS
  'If set, PIN entry is locked until this timestamp (after 5 failed attempts)';
COMMENT ON COLUMN public.orders.order_group_id IS
  'Groups stacked orders that a driver accepted together for a single multi-stop run';

-- Index for fast active-order look-up by group
CREATE INDEX IF NOT EXISTS idx_orders_order_group_id
  ON public.orders (order_group_id)
  WHERE order_group_id IS NOT NULL;

-- ── 2. api_rate_limits ────────────────────────────────────────────────────────
-- Tracks individual edge-function invocations for per-user rate limiting.
-- Rows are cleaned up by the edge function itself (window-based delete).

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL,
  endpoint    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_client_endpoint_time
  ON public.api_rate_limits (client_id, endpoint, created_at);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the service role (edge functions) should write to this table
CREATE POLICY "Service role only — rate limits"
  ON public.api_rate_limits
  USING (false)          -- no direct client reads
  WITH CHECK (false);    -- no direct client writes

-- ── 3. flash_offers ───────────────────────────────────────────────────────────
-- Admin-created geographic bonus zones for drivers. When a driver is within
-- zone_radius_miles of (zone_latitude, zone_longitude) before expires_at,
-- they can claim the bonus_amount.

CREATE TABLE IF NOT EXISTS public.flash_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  bonus_amount       numeric(10, 2) NOT NULL,
  zone_latitude      double precision NOT NULL,
  zone_longitude     double precision NOT NULL,
  zone_radius_miles  numeric(6, 2) NOT NULL DEFAULT 2,
  is_active          boolean NOT NULL DEFAULT true,
  starts_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  max_claims         integer,           -- null = unlimited
  created_by         uuid REFERENCES auth.users (id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flash_offers_active_expires
  ON public.flash_offers (is_active, expires_at)
  WHERE is_active = true;

ALTER TABLE public.flash_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage flash offers"
  ON public.flash_offers
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Drivers can read active offers"
  ON public.flash_offers FOR SELECT
  USING (
    is_active = true
    AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'driver'
    )
  );

-- ── 4. driver_flash_claims ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.driver_flash_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    uuid NOT NULL REFERENCES public.flash_offers (id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES auth.users (id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_flash_claims_driver
  ON public.driver_flash_claims (driver_id);

ALTER TABLE public.driver_flash_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can read own claims"
  ON public.driver_flash_claims FOR SELECT
  USING (auth.uid() = driver_id);

-- ── 5. seller_licenses ────────────────────────────────────────────────────────
-- Stores uploaded business licenses for maker stores.
-- Referenced by check-license-expiry and notify-license-status edge functions.

CREATE TABLE IF NOT EXISTS public.seller_licenses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users (id),
  store_id                uuid,   -- FK to food_makers.id when applicable
  license_number          text,
  issuing_authority       text,
  issued_at               date,
  expires_at              date,
  document_url            text,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  admin_notes             text,
  last_expiry_reminder_at timestamptz,
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz,
  reviewed_by             uuid REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS idx_seller_licenses_user_id
  ON public.seller_licenses (user_id);
CREATE INDEX IF NOT EXISTS idx_seller_licenses_status_expires
  ON public.seller_licenses (status, expires_at)
  WHERE status = 'approved' AND expires_at IS NOT NULL;

ALTER TABLE public.seller_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own licenses"
  ON public.seller_licenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Sellers insert own licenses"
  ON public.seller_licenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all licenses"
  ON public.seller_licenses
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 6. RPC: increment_pin_attempts ───────────────────────────────────────────
-- Used by the business-logic edge function to atomically increment the
-- PIN attempt counter and lock the order after 5 failures.
-- Returns the new attempt count.

CREATE OR REPLACE FUNCTION public.increment_pin_attempts(p_order_id uuid)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_attempts smallint;
BEGIN
  UPDATE orders
  SET
    pickup_pin_attempts = pickup_pin_attempts + 1,
    pin_attempts        = pin_attempts + 1,       -- keep legacy column in sync
    pin_locked_until    = CASE
      WHEN pickup_pin_attempts + 1 >= 5
        THEN now() + interval '30 minutes'
      ELSE NULL
    END
  WHERE id = p_order_id
  RETURNING pickup_pin_attempts INTO v_new_attempts;

  RETURN v_new_attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_pin_attempts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_pin_attempts(uuid) FROM authenticated;
-- Only callable by service role (edge functions)
