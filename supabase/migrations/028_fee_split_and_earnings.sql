-- ─────────────────────────────────────────────────────────────────────────────
-- 028: Fee split + earnings tables
--
-- • maker_earnings     — per-order payout record for food makers
-- • order_fee_splits   — immutable audit record of how each delivered order
--                        was split across driver / maker / platform
-- • Ensure orders has the fee columns needed for split calculation
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure orders has every fee column ─────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee     numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS small_order_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_fee       numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee    numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_payout   numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maker_payout    numeric(10,2) NOT NULL DEFAULT 0;

-- ── 2. maker_earnings — records every payout to a food maker ─────────────────
CREATE TABLE IF NOT EXISTS public.maker_earnings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maker_id        uuid NOT NULL REFERENCES public.food_makers(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  subtotal        numeric(10,2) NOT NULL,
  platform_commission numeric(10,2) NOT NULL DEFAULT 0,
  payout          numeric(10,2) NOT NULL,  -- subtotal - platform_commission
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','reversed')),
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)   -- one record per order
);

ALTER TABLE public.maker_earnings ENABLE ROW LEVEL SECURITY;

-- Makers read their own earnings
CREATE POLICY "maker_earnings_own_select"
  ON public.maker_earnings FOR SELECT
  USING (
    maker_id IN (
      SELECT id FROM public.food_makers WHERE user_id = auth.uid()
    )
  );

-- Only service role may insert / update (done via API route with admin key)
CREATE POLICY "maker_earnings_service_all"
  ON public.maker_earnings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. order_fee_splits — immutable audit log per delivered order ─────────────
CREATE TABLE IF NOT EXISTS public.order_fee_splits (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  subtotal             numeric(10,2) NOT NULL,
  delivery_fee         numeric(10,2) NOT NULL,
  service_fee          numeric(10,2) NOT NULL,
  small_order_fee      numeric(10,2) NOT NULL DEFAULT 0,
  surge_fee            numeric(10,2) NOT NULL DEFAULT 0,
  tip_amount           numeric(10,2) NOT NULL DEFAULT 0,
  driver_payout        numeric(10,2) NOT NULL,
  maker_payout         numeric(10,2) NOT NULL,
  platform_commission  numeric(10,2) NOT NULL,
  platform_net         numeric(10,2) NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.order_fee_splits ENABLE ROW LEVEL SECURITY;

-- Admins can read all splits
CREATE POLICY "order_fee_splits_admin_select"
  ON public.order_fee_splits FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Drivers can read their own order splits
CREATE POLICY "order_fee_splits_driver_select"
  ON public.order_fee_splits FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE nexter_id = auth.uid()
    )
  );

-- Makers can read splits for their orders
CREATE POLICY "order_fee_splits_maker_select"
  ON public.order_fee_splits FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.food_makers fm ON fm.id = o.maker_id
      WHERE fm.user_id = auth.uid()
    )
  );

-- Service role writes
CREATE POLICY "order_fee_splits_service_all"
  ON public.order_fee_splits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 4. app_settings: add platform_commission_pct if missing ──────────────────
INSERT INTO public.app_settings (key, value)
VALUES
  ('platform_commission_pct', '5'),
  ('maker_payout_delay_days', '3')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Index on maker_earnings for maker dashboard queries ────────────────────
CREATE INDEX IF NOT EXISTS idx_maker_earnings_maker_created
  ON public.maker_earnings (maker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_fee_splits_order
  ON public.order_fee_splits (order_id);
