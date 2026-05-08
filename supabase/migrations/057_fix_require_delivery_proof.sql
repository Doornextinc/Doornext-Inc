-- Migration 057: Reset require_delivery_proof to false.
--
-- Migration 030 intended to add a feature-flag for mandatory proof photos.
-- Migration 037 re-inserted it into the correct `settings` table but left the
-- value as `true`, which caused ALL deliveries to be blocked server-side with
-- a 422 if no proof photo was uploaded — even when the driver app UI didn't
-- show the proof-photo capture step (it only showed for contactless deliveries).
--
-- Default to false: proof photo is optional unless admin explicitly enables it
-- via the admin hub settings panel.

UPDATE public.settings
SET value = 'false'
WHERE key = 'require_delivery_proof';

-- Also ensure the row exists (idempotent)
INSERT INTO public.settings (key, value)
VALUES ('require_delivery_proof', 'false')
ON CONFLICT (key) DO NOTHING;
