-- Migration 037: Fix require_delivery_proof inserted into wrong table in migration 030.
-- All application code reads from `settings`; migration 030 accidentally used `app_settings`.
INSERT INTO public.settings (key, value)
VALUES ('require_delivery_proof', 'true')
ON CONFLICT (key) DO NOTHING;
