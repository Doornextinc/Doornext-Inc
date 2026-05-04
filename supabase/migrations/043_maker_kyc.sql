-- ============================================================
-- 043: Maker KYC / business verification
--
-- Makers must declare their business structure and upload
-- supporting documents before an admin can approve them.
-- ============================================================

-- ── Storage bucket for private maker documents ────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maker-documents',
  'maker-documents',
  false,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Only the owning maker (folder = user_id) can upload/read their own files.
-- Admins read via service role (bypasses RLS).
CREATE POLICY "Makers upload own KYC docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'maker-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Makers read own KYC docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'maker-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── maker_documents table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maker_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maker_id         uuid NOT NULL UNIQUE REFERENCES public.food_makers(id)  ON DELETE CASCADE,
  user_id          uuid NOT NULL UNIQUE REFERENCES auth.users               ON DELETE CASCADE,

  -- ── Business identity ──────────────────────────────────────────────────────
  business_type    text NOT NULL
    CHECK (business_type IN ('sole_proprietor', 'llc', 'corporation', 'partnership')),
  legal_name       text NOT NULL,           -- full legal name or registered business name
  dba_name         text,                    -- "doing business as" / trade name (optional)
  ein              text,                    -- EIN for LLC / Corp / Partnership
  ssn_last4        text,                    -- last 4 of SSN for sole proprietors
  business_phone   text,
  business_address text,

  -- ── Document storage paths (private bucket: maker-documents) ──────────────
  identity_front_path text,                -- govt ID front / passport photo page
  identity_back_path  text,                -- govt ID back (not needed for passport)
  business_doc_path   text,                -- Articles of Org/Inc, EIN letter, partnership agreement
  food_permit_path    text,                -- food handler's license / health permit (optional)

  -- ── Submission & review ───────────────────────────────────────────────────
  kyc_status       text NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted', 'pending_review', 'approved', 'rejected')),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid REFERENCES auth.users ON DELETE SET NULL,
  review_notes     text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maker_documents_user_id
  ON public.maker_documents (user_id);

CREATE INDEX IF NOT EXISTS idx_maker_documents_pending
  ON public.maker_documents (submitted_at DESC)
  WHERE kyc_status = 'pending_review';

ALTER TABLE public.maker_documents ENABLE ROW LEVEL SECURITY;

-- Maker can read and update their own record (insert via service role in API)
CREATE POLICY "Maker owns their document record"
  ON public.maker_documents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── Add kyc_status to food_makers for fast status queries ─────────────────────
ALTER TABLE public.food_makers
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted', 'pending_review', 'approved', 'rejected'));

-- Existing makers that are already approved are grandfathered through KYC
UPDATE public.food_makers
SET kyc_status = 'approved'
WHERE approval_status = 'approved';


-- ── Trigger: keep food_makers.kyc_status in sync with maker_documents ────────
CREATE OR REPLACE FUNCTION public.sync_maker_kyc_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.food_makers
  SET kyc_status = NEW.kyc_status
  WHERE id = NEW.maker_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_maker_kyc_status ON public.maker_documents;
CREATE TRIGGER trg_sync_maker_kyc_status
  AFTER INSERT OR UPDATE OF kyc_status ON public.maker_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_maker_kyc_status();
