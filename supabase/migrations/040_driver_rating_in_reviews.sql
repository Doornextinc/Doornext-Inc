-- ============================================================
-- 040: Add driver rating to reviews
--
-- Customers can now rate both the food maker and the delivery
-- driver in the post-delivery review flow.
-- ============================================================

-- Add nexter_id (which driver handled this order) and driver_rating
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS nexter_id    uuid REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_rating integer CHECK (driver_rating BETWEEN 1 AND 5);

-- Index for fast per-driver average queries
CREATE INDEX IF NOT EXISTS idx_reviews_nexter_id
  ON public.reviews (nexter_id)
  WHERE nexter_id IS NOT NULL;

-- Trigger function: keep driver_profiles.avg_rating up to date
CREATE OR REPLACE FUNCTION public.update_driver_avg_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.nexter_id IS NOT NULL AND NEW.driver_rating IS NOT NULL THEN
    UPDATE public.driver_profiles
    SET avg_rating = (
      SELECT ROUND(AVG(driver_rating)::numeric, 2)
      FROM   public.reviews
      WHERE  nexter_id    = NEW.nexter_id
        AND  driver_rating IS NOT NULL
    )
    WHERE id = NEW.nexter_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_driver_avg_rating ON public.reviews;
CREATE TRIGGER trg_update_driver_avg_rating
  AFTER INSERT OR UPDATE OF driver_rating ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_driver_avg_rating();
