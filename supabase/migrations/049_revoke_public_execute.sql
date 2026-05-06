-- ============================================================
-- 049 — Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
-- ============================================================
-- Migration 048 revoked from `anon` and `authenticated` individually,
-- but PostgreSQL grants EXECUTE to PUBLIC by default — anon/authenticated
-- inherit through PUBLIC so specific revokes have no effect.
-- The correct fix is REVOKE FROM PUBLIC.
--
-- service_role and postgres retain access implicitly (superuser).
-- Triggers fire as the function owner, not through role grants.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_driver()               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_modification()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_ready_since()               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_driver_avg_rating()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_maker_rating()             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_stale_driver_assignments() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_maker_kyc_status()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_kyc_on_maker_approval()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_driver_completion_rate(driver_id uuid)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_driver_accepted(driver_id uuid)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_driver_cancellation(driver_id uuid)                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_maker_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_tip(p_order_id uuid, p_customer_id uuid, p_tip_amount numeric)            FROM PUBLIC;
