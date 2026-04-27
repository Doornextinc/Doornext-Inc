-- Migration 023: Profile column safety + backfill missing user rows
-- Run this in Supabase SQL Editor if the profile page saves are broken

-- 1. Ensure all optional columns exist on the users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL
    DEFAULT '{"pushOrders":true,"pushMessages":true,"pushPromos":false,"soundEnabled":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 2. Backfill: create a public.users row for any auth user who is missing one
--    (handles accounts created before the trigger was set up)
INSERT INTO public.users (id, email, full_name, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);

-- 3. Ensure the INSERT RLS policy exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can insert their own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can insert their own profile"
        ON public.users FOR INSERT WITH CHECK (auth.uid() = id)
    $policy$;
  END IF;
END $$;
