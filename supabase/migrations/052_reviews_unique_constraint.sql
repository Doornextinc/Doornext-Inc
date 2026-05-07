-- ============================================================
-- 052: Add unique constraint on reviews(order_id, customer_id)
--
-- The customer app uses supabase upsert with:
--   onConflict: 'order_id,customer_id'
-- But no UNIQUE constraint existed on that pair, causing the upsert
-- to fail with "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" — silently blocking all review saves.
--
-- Also recalculates avg_rating / total_reviews for all existing makers
-- and drivers so the admin panel shows live values immediately.
-- ============================================================

-- 1. Deduplicate any existing rows before adding constraint
--    (keep the most recent review per order+customer pair)
DELETE FROM public.reviews r1
USING public.reviews r2
WHERE r1.order_id    = r2.order_id
  AND r1.customer_id = r2.customer_id
  AND r1.created_at  < r2.created_at;

-- 2. Add the unique constraint the upsert relies on
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_order_customer_unique
  UNIQUE (order_id, customer_id);

-- 3. Backfill maker avg_rating + total_reviews from any existing reviews
UPDATE public.food_makers fm
SET
  avg_rating    = COALESCE((
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM   public.reviews r
    WHERE  r.maker_id = fm.id
  ), 0),
  total_reviews = (
    SELECT COUNT(*) FROM public.reviews r WHERE r.maker_id = fm.id
  );

-- 4. Backfill driver avg_rating from any existing reviews
UPDATE public.driver_profiles dp
SET avg_rating = (
  SELECT ROUND(AVG(r.driver_rating)::numeric, 2)
  FROM   public.reviews r
  WHERE  r.nexter_id    = dp.id
    AND  r.driver_rating IS NOT NULL
)
WHERE EXISTS (
  SELECT 1 FROM public.reviews r
  WHERE  r.nexter_id    = dp.id
    AND  r.driver_rating IS NOT NULL
);
