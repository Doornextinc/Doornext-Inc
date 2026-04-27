-- Add optional vehicle registration document path to driver_documents
-- Allows drivers to upload registration alongside insurance during KYC

ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS registration_path text;

COMMENT ON COLUMN driver_documents.registration_path IS
  'Optional vehicle registration document uploaded during KYC — path in driver-documents storage bucket';
