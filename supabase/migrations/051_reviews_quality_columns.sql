-- ============================================================
-- 051: Add food_quality and packaging_quality to reviews
--
-- These columns are referenced in the customer app review UI
-- but were never added to the schema, causing every review
-- upsert to fail silently (PostgREST returns 400 for unknown
-- columns), which meant no reviews were ever saved and therefore
-- the rating triggers (update_maker_rating, update_driver_avg_rating)
-- never fired — leaving all avg_ratings at 0.
-- ============================================================

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS food_quality      text CHECK (food_quality IN ('poor', 'okay', 'good', 'amazing')),
  ADD COLUMN IF NOT EXISTS packaging_quality text CHECK (packaging_quality IN ('poor', 'okay', 'good', 'amazing'));

-- Allow customers to update their own review (needed for upsert with onConflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'reviews'
      AND policyname = 'Customers update own reviews'
  ) THEN
    CREATE POLICY "Customers update own reviews"
      ON public.reviews FOR UPDATE
      USING (auth.uid() = customer_id)
      WITH CHECK (auth.uid() = customer_id);
  END IF;
END$$;
