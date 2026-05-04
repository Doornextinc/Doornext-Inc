-- ============================================================
-- 042: Maker approval workflow
--
-- New makers start in 'pending' state. An admin must explicitly
-- approve them before they appear to customers and can go open.
-- Existing makers are grandfathered in as 'approved'.
-- ============================================================

ALTER TABLE public.food_makers
  ADD COLUMN IF NOT EXISTS approval_status  text        NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by      uuid REFERENCES auth.users ON DELETE SET NULL;

-- Grandfather existing makers — they were already operating
UPDATE public.food_makers
SET approval_status = 'approved'
WHERE approval_status = 'pending';

-- Fast lookup for the admin pending queue
CREATE INDEX IF NOT EXISTS idx_food_makers_pending
  ON public.food_makers (created_at DESC)
  WHERE approval_status = 'pending';

-- Customers should only see approved makers (update the existing select policy)
-- Drop and recreate the permissive select policy to filter by approval
DROP POLICY IF EXISTS "food_makers_select" ON public.food_makers;
DROP POLICY IF EXISTS "Anyone can view food makers" ON public.food_makers;

CREATE POLICY "Approved makers are publicly visible"
  ON public.food_makers FOR SELECT
  USING (
    approval_status = 'approved'
    OR auth.uid() = user_id   -- maker can always see their own record
  );
