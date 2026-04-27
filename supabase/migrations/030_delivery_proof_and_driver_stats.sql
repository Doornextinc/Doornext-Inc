-- Migration 030: delivery proof, GPS stamp, driver reliability stats, refund tracking
--
-- Addresses audit items:
--   • GPS proximity check requires lat/lng captured at delivery time
--   • Photo proof requires proof_photo_path column (upload-proof route uses it already,
--     this formalises the column and adds delivery_proof_url for the signed URL cache)
--   • Driver reliability scoring requires acceptance_rate / completion_rate columns
--   • stripe_refund_id needed by the failed-delivery refund flow

-- ── Orders: delivery evidence ──────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS proof_photo_path  TEXT,           -- storage path set by upload-proof
  ADD COLUMN IF NOT EXISTS delivery_lat      DOUBLE PRECISION,  -- driver GPS at delivered moment
  ADD COLUMN IF NOT EXISTS delivery_lng      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,    -- server timestamp of delivered status
  ADD COLUMN IF NOT EXISTS stripe_refund_id  TEXT;           -- Stripe refund ID (failed delivery)

-- Seed setting so the admin UI can toggle proof enforcement
INSERT INTO public.app_settings (key, value)
VALUES ('require_delivery_proof', 'true')
ON CONFLICT (key) DO NOTHING;

-- Index to find unproven delivered orders quickly (ops reconciliation)
CREATE INDEX IF NOT EXISTS idx_orders_no_proof
  ON public.orders (status, proof_photo_path)
  WHERE status = 'delivered' AND proof_photo_path IS NULL;

-- ── Driver profiles: reliability scoring ──────────────────────────────────
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS total_requests      INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accepted      INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cancellations INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_rate     NUMERIC(5, 2)  NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS completion_rate     NUMERIC(5, 2)  NOT NULL DEFAULT 100.00;

COMMENT ON COLUMN public.driver_profiles.acceptance_rate IS
  'Running acceptance rate: (total_accepted / total_requests) * 100. '
  'Updated on each accept or implicit decline (order expires while visible).';

COMMENT ON COLUMN public.driver_profiles.completion_rate IS
  'Running completion rate: delivered / (accepted - still-active). '
  'Decremented on failed_delivery or mid-delivery cancellation.';

-- ── Atomic stat RPC functions ──────────────────────────────────────────────

-- Called by accept-order route: increment accepted count + recompute acceptance_rate
CREATE OR REPLACE FUNCTION public.increment_driver_accepted(driver_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.driver_profiles
     SET total_accepted   = COALESCE(total_accepted, 0) + 1,
         acceptance_rate  = ROUND(
           ((COALESCE(total_accepted, 0) + 1)::NUMERIC
            / GREATEST(COALESCE(total_requests, 0) + 1, 1) * 100), 2
         )
   WHERE id = driver_id;
END;
$$;

-- Called by failed-delivery route: increment cancellations + recompute completion_rate
CREATE OR REPLACE FUNCTION public.increment_driver_cancellation(driver_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.driver_profiles
     SET total_cancellations = COALESCE(total_cancellations, 0) + 1,
         completion_rate     = ROUND(
           (COALESCE(total_deliveries, 0)::NUMERIC
            / GREATEST(COALESCE(total_accepted, 0), 1) * 100), 2
         )
   WHERE id = driver_id;
END;
$$;

-- Called by update-status route after successful delivery: recompute completion_rate
CREATE OR REPLACE FUNCTION public.recompute_driver_completion_rate(driver_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.driver_profiles
     SET completion_rate = ROUND(
           (COALESCE(total_deliveries, 0)::NUMERIC
            / GREATEST(COALESCE(total_accepted, 0), 1) * 100), 2
         )
   WHERE id = driver_id;
END;
$$;
