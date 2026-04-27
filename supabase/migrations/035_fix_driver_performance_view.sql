-- ============================================================
-- 035: Fix driver_performance view — SECURITY INVOKER
-- ============================================================
-- PostgreSQL views default to SECURITY DEFINER (run as the view owner,
-- bypassing RLS). Supabase Advisor flags this as a critical security issue
-- because it means any authenticated user who can query the view sees all
-- rows regardless of their own RLS policies.
--
-- Fix: recreate the view with security_invoker = true so it executes with
-- the permissions of the calling role — RLS is enforced as expected.
-- Only admin service-role callers (which bypass RLS by design) can see all
-- driver rows; anon/authenticated users are blocked by the table's RLS.

DROP VIEW IF EXISTS public.driver_performance;

CREATE VIEW public.driver_performance
  WITH (security_invoker = true)
AS
SELECT
  dp.id,
  dp.full_name,
  dp.vehicle_type,
  dp.is_active,
  dp.kyc_status,
  dp.total_deliveries,
  dp.avg_rating,
  COUNT(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '7 days'
    THEN 1 END)::int AS deliveries_7d,
  COUNT(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '30 days'
    THEN 1 END)::int AS deliveries_30d,
  COALESCE(SUM(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '30 days'
    THEN o.driver_payout END), 0)::numeric AS earnings_30d,
  COUNT(CASE
    WHEN o.status = 'cancelled'
     AND o.nexter_id = dp.id
    THEN 1 END)::int AS cancellations_total,
  dp.created_at
FROM driver_profiles dp
LEFT JOIN orders o ON o.nexter_id = dp.id
GROUP BY dp.id;

-- Grant access to the roles that need it
-- (service_role already bypasses RLS; authenticated role is blocked by
--  driver_profiles RLS unless the user is an admin)
GRANT SELECT ON public.driver_performance TO authenticated;
GRANT SELECT ON public.driver_performance TO service_role;
