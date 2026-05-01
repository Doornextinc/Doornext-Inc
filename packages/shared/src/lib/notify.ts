/**
 * Cross-app notification helper for maker and driver apps.
 *
 * Inserts a row into `notifications` (for in-app notification centre) and
 * fires a push notification to the user's registered device(s) by calling
 * the customer app's internal FCM endpoint.
 *
 * Set NOTIFY_PUSH_BASE_URL in each app's .env.local to point at the customer
 * app (e.g. http://localhost:3000 in dev, https://app.doornext.com in prod).
 * If unset, the push is silently skipped (in-app notification still works).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

interface NotifyOpts {
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Insert notification to DB. Call this from any server route.
 * Push is sent fire-and-forget so it never blocks the response.
 */
export async function notifyUser(
  adminClient: SupabaseClient,
  opts: NotifyOpts,
): Promise<void> {
  const { userId, type, title, body, data } = opts

  // 1. DB insert — always do this first so the in-app bell always works
  try {
    const { error } = await adminClient.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data: data ?? {},
    })
    if (error) {
      Sentry.captureException(new Error(`notifyUser DB insert failed: ${error.message}`), {
        extra: { userId, type },
      })
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { userId, type, context: 'notifyUser-db' } })
  }

  // 2. Push to device — best-effort, fire-and-forget
  void sendPushViaInternalEndpoint(adminClient, userId, title, body, data)
}

async function sendPushViaInternalEndpoint(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const baseUrl = process.env.NOTIFY_PUSH_BASE_URL
  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!baseUrl || !secret) return // push silently skipped if not configured

  try {
    // Look up user's push tokens
    const { data: tokens } = await adminClient
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', userId)

    if (!tokens?.length) return

    // Filter null/undefined data values to avoid sending literal "null"/"undefined" strings
    const pushData = data
      ? Object.fromEntries(
          Object.entries(data)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      : {}

    await Promise.allSettled(
      tokens.map(({ token }: { token: string }) =>
        fetch(`${baseUrl}/api/webhooks/fcm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ userId, token, title, body: body, data: pushData }),
        }),
      ),
    )
  } catch {
    // Non-fatal
  }
}
