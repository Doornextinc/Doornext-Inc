-- Allow PDF uploads in the driver-documents storage bucket.
-- The original creation (005_driver_onboarding.sql) only listed image types.
-- Insurance cards and ID scans are frequently uploaded as PDFs.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]
WHERE id = 'driver-documents';
