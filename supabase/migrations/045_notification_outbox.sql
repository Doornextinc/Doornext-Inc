-- ============================================================
-- 045: Durable notification outbox
--
-- Critical operational notifications (new order, driver assigned,
-- payment failed, failed delivery, stale assignment, etc.) must
-- survive transient FCM/push failures and be retried automatically.
--
-- This migration adds:
--   • notification_outbox table — durable record of every push
--     send attempt with status, retry count, and error details
--   • is_critical column on notifications — marks which in-app
--     notifications must never be silently dropped
-- ============================================================

-- 1. Notification outbox table
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id   UUID        REFERENCES public.notifications(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  body              TEXT        NOT NULL,
  data              JSONB       NOT NULL DEFAULT '{}',
  -- Routing
  fcm_token         TEXT,           -- NULL = broadcast to all user tokens
  -- Lifecycle
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  retry_count       INTEGER     NOT NULL DEFAULT 0,
  max_retries       INTEGER     NOT NULL DEFAULT 5,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempted_at TIMESTAMPTZ,
  last_error        TEXT,
  provider_response JSONB,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ
);

-- Index for worker polling: pending entries due for retry
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

-- Index for operator queries: dead-letter monitoring
CREATE INDEX IF NOT EXISTS idx_notification_outbox_dead
  ON public.notification_outbox (created_at DESC)
  WHERE status = 'dead';

-- Index for user notification lookup
CREATE INDEX IF NOT EXISTS idx_notification_outbox_user
  ON public.notification_outbox (user_id, created_at DESC);

COMMENT ON TABLE public.notification_outbox IS
  'Durable push notification queue. pending → sent on success. '
  'pending → retry (exponential backoff) on transient failure. '
  'After max_retries exceeded → dead (surfaced in admin operations).';

-- 2. Add is_critical flag to notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notifications.is_critical IS
  'When true, this notification is written to notification_outbox for '
  'durable push delivery with retries. Non-critical notifications are '
  'best-effort fire-and-forget.';

-- 3. RLS for notification_outbox (admin-only write, no direct user reads needed)
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by cron worker)
CREATE POLICY "service_role_all" ON public.notification_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No user-facing RLS needed — this table is internal to the worker
