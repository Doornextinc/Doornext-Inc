-- ============================================================
-- 050 — Revoke explicit authenticated grants on RPC functions
-- ============================================================
-- These 6 functions had an explicit GRANT EXECUTE TO authenticated
-- in an earlier migration, which survives the REVOKE FROM PUBLIC
-- in migration 049. Must revoke the specific grant directly.
--
-- All 6 are called exclusively from server-side Next.js API routes
-- using the service_role key — no client JWT is ever used to call
-- them directly, so revoking authenticated access is safe.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.increment_driver_accepted(driver_id uuid)                        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_driver_cancellation(driver_id uuid)                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_driver_completion_rate(driver_id uuid)                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)       FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.request_maker_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_tip(p_order_id uuid, p_customer_id uuid, p_tip_amount numeric)            FROM authenticated;
