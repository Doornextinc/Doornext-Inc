-- Migration 058: Add address text column to food_makers.
--
-- food_makers previously stored only lat/lng with no human-readable address.
-- The driver delivery-request card and RoutePreviewMap geocoding fallback both
-- need a text address for display and as a Nominatim lookup seed when
-- coordinates are unexpectedly zero/null.
--
-- The column is nullable so existing rows are unaffected; the maker profile
-- page should populate it when the maker saves their location.

ALTER TABLE public.food_makers
  ADD COLUMN IF NOT EXISTS address text;
