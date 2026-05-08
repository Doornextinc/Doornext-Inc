-- Add vehicle detail columns to driver_profiles.
-- vehicle_type already exists; adding make/year/color/plate which the driver app
-- collects and displays in the Documents > Vehicle Information section.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS vehicle_make  text,
  ADD COLUMN IF NOT EXISTS vehicle_year  text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text;

-- Add vehicle photo path to driver_documents.
-- Drivers can upload a photo of their vehicle from the Documents page.
ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS vehicle_photo_path text;
