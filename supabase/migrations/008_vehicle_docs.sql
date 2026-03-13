-- Add motorbike vehicle type
ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_vehicle_type_check;
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_vehicle_type_check
  CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'foot'));

-- Add insurance, background check and avatar fields
ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS insurance_path      text,
  ADD COLUMN IF NOT EXISTS bg_check_consent    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bg_check_consented_at timestamptz;

-- Store avatar as a path in the driver-documents bucket
-- driver_profiles.avatar_url already exists (text) — repurpose to store signed URL
