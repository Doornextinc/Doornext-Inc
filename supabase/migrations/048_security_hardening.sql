-- ============================================================
-- 048 — Security hardening (Supabase Security Advisor fixes)
-- ============================================================
-- Fixes three categories of warnings:
--   1. function_search_path_mutable        — pin search_path on every SECURITY DEFINER fn
--   2. anon/authenticated_security_definer — revoke direct RPC access where not needed
--   3. public_bucket_allows_listing        — drop broad SELECT policies on public buckets
-- Note: "Leaked password protection" must be enabled manually in the Supabase dashboard
--       (Auth → Settings → Enable HaveIBeenPwned protection).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1.  Pin search_path on all SECURITY DEFINER functions
--     Prevents search-path hijacking attacks.
-- ────────────────────────────────────────────────────────────

ALTER FUNCTION public.handle_new_driver()                                               SET search_path = public;
ALTER FUNCTION public.handle_new_user()                                                 SET search_path = public;
ALTER FUNCTION public.prevent_audit_log_modification()                                  SET search_path = public;
ALTER FUNCTION public.stamp_ready_since()                                               SET search_path = public;
ALTER FUNCTION public.update_driver_avg_rating()                                        SET search_path = public;
ALTER FUNCTION public.update_maker_rating()                                             SET search_path = public;
ALTER FUNCTION public.release_stale_driver_assignments()                                SET search_path = public;
ALTER FUNCTION public.sync_maker_kyc_status()                                           SET search_path = public;
ALTER FUNCTION public.sync_kyc_on_maker_approval()                                      SET search_path = public;
ALTER FUNCTION public.recompute_driver_completion_rate(driver_id uuid)                  SET search_path = public;
ALTER FUNCTION public.increment_driver_accepted(driver_id uuid)                         SET search_path = public;
ALTER FUNCTION public.increment_driver_cancellation(driver_id uuid)                     SET search_path = public;
ALTER FUNCTION public.request_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)        SET search_path = public;
ALTER FUNCTION public.request_maker_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)  SET search_path = public;
ALTER FUNCTION public.submit_tip(p_order_id uuid, p_customer_id uuid, p_tip_amount numeric)             SET search_path = public;


-- ────────────────────────────────────────────────────────────
-- 2a. Revoke EXECUTE from anon on ALL SECURITY DEFINER functions
--     Anonymous (unauthenticated) callers should never invoke these.
-- ────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.handle_new_driver()                                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_modification()                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_ready_since()                                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_driver_avg_rating()                                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_maker_rating()                                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_stale_driver_assignments()                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_maker_kyc_status()                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_kyc_on_maker_approval()                                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_driver_completion_rate(driver_id uuid)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_driver_accepted(driver_id uuid)                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_driver_cancellation(driver_id uuid)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_maker_withdrawal_atomic(p_user_id uuid, p_amount numeric, p_method text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_tip(p_order_id uuid, p_customer_id uuid, p_tip_amount numeric)             FROM anon;


-- ────────────────────────────────────────────────────────────
-- 2b. Revoke EXECUTE from authenticated on trigger-only functions
--     These are fired exclusively by DB triggers or cron jobs —
--     no signed-in user should call them via /rest/v1/rpc/...
-- ────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.handle_new_driver()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_modification()  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_ready_since()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_driver_avg_rating()        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_maker_rating()             FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stale_driver_assignments() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_maker_kyc_status()           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_kyc_on_maker_approval()      FROM authenticated;

-- NOTE: the following functions remain callable by `authenticated` because they
-- are invoked via Supabase RPC from server-side API routes with a user JWT:
--   • increment_driver_accepted / increment_driver_cancellation / recompute_driver_completion_rate
--   • request_withdrawal_atomic / request_maker_withdrawal_atomic
--   • submit_tip


-- ────────────────────────────────────────────────────────────
-- 3.  Remove broad SELECT (listing) policies from public buckets
--     Public buckets serve files by URL without any RLS policy —
--     the SELECT policy only adds the ability to enumerate all
--     filenames, which leaks more than intended.
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public avatar read"          ON storage.objects;
DROP POLICY IF EXISTS "Public banner read"          ON storage.objects;
DROP POLICY IF EXISTS "Public menu item photo read" ON storage.objects;

-- Objects in these public buckets remain readable via their public URL;
-- clients simply can no longer list all files in the bucket.
