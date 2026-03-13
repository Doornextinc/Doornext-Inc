-- Driver onboarding: KYC status, phone, and document storage

-- Add phone + KYC status to driver_profiles
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted', 'pending_review', 'approved', 'rejected'));

-- Driver KYC documents table (one row per driver)
CREATE TABLE IF NOT EXISTS driver_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  -- Personal info
  kyc_full_name        text,
  kyc_date_of_birth    date,
  kyc_ssn_last4        text,
  kyc_address          text,
  -- Document type + storage paths
  id_type              text CHECK (id_type IN ('drivers_license', 'passport', 'national_id')),
  front_path           text,
  back_path            text,
  selfie_path          text,
  -- Review state
  submitted_at         timestamptz DEFAULT now(),
  reviewed_at          timestamptz,
  reviewed_by          uuid REFERENCES auth.users,
  review_notes         text
);

ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_documents_insert_own"
  ON driver_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "driver_documents_select_own"
  ON driver_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "driver_documents_admin_all"
  ON driver_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Private storage bucket for driver document photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "driver_docs_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'driver-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "driver_docs_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'driver-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "driver_docs_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'driver-documents' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
