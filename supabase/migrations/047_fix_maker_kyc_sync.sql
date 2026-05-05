-- ============================================================
-- 047: Fix maker kyc_status / approval_status sync
--
-- Bug: admin approval (setting food_makers.approval_status = 'approved')
-- never updated food_makers.kyc_status, leaving approved makers with
-- kyc_status = 'not_submitted' and routing them to /onboarding forever.
--
-- Fix 1: back-fill — any maker that is approved but kyc not marked approved.
-- Fix 2: BEFORE UPDATE trigger so future approvals stay in sync.
-- ============================================================

-- ── Back-fill existing data ───────────────────────────────────────────────────
UPDATE public.food_makers
SET kyc_status = 'approved'
WHERE approval_status = 'approved'
  AND kyc_status != 'approved';


-- ── Trigger: when approval_status → 'approved', auto-approve kyc_status ──────
CREATE OR REPLACE FUNCTION public.sync_kyc_on_maker_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND (OLD.approval_status IS DISTINCT FROM 'approved') THEN
    NEW.kyc_status = 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_kyc_on_maker_approval ON public.food_makers;
CREATE TRIGGER trg_sync_kyc_on_maker_approval
  BEFORE UPDATE OF approval_status ON public.food_makers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_kyc_on_maker_approval();
