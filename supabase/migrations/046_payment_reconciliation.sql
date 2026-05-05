-- ============================================================
-- 046: Payment reconciliation fields
--
-- Adds explicit refund lifecycle tracking to orders so that
-- Stripe refund state and internal order state can never drift
-- silently. A scheduled reconciliation job polls orders with
-- 'pending' refund status and syncs them against Stripe.
--
-- Fields added to orders:
--   refund_status        — pending | completed | failed | not_required
--   refund_requested_at  — when refund was initiated
--   refund_completed_at  — when Stripe confirmed completion
--   refund_failure_reason — last failure message for admin visibility
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_status         TEXT
    CHECK (refund_status IN ('pending', 'completed', 'failed', 'not_required')),
  ADD COLUMN IF NOT EXISTS refund_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_failure_reason TEXT;

COMMENT ON COLUMN public.orders.refund_status IS
  'pending = refund initiated but not yet confirmed by Stripe. '
  'completed = Stripe confirmed refund. failed = Stripe rejected refund. '
  'not_required = order was cash or was voided (no charge captured). '
  'NULL = no refund action has been taken.';

-- Index for reconciliation job to find pending refunds efficiently
CREATE INDEX IF NOT EXISTS idx_orders_refund_pending
  ON public.orders (refund_requested_at)
  WHERE refund_status = 'pending';

-- Index for admin monitoring of failed refunds
CREATE INDEX IF NOT EXISTS idx_orders_refund_failed
  ON public.orders (updated_at DESC)
  WHERE refund_status = 'failed';

-- Back-fill: orders that already have a stripe_refund_id are 'completed'
UPDATE public.orders
   SET refund_status = 'completed',
       refund_completed_at = updated_at
 WHERE stripe_refund_id IS NOT NULL
   AND refund_status IS NULL;

-- Back-fill: cancelled cash orders are 'not_required'
UPDATE public.orders
   SET refund_status = 'not_required'
 WHERE payment_method = 'cash'
   AND status = 'cancelled'
   AND refund_status IS NULL;
