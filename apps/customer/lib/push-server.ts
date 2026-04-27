/**
 * Server-side push notification helper.
 * Looks up a user's registered FCM tokens and sends the push via Firebase Admin SDK.
 * Call this after inserting to the `notifications` table.
 *
 * Non-throwing: all errors are caught and logged so they don't interrupt the
 * main response flow.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function sendPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const { data: tokens, error } = await adminClient
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', userId)

    if (error || !tokens?.length) return

    const { getFirebaseAdmin } = await import('@/lib/firebase-admin')
    const firebaseAdmin = getFirebaseAdmin()

    await Promise.allSettled(
      tokens.map(({ token }: { token: string }) =>
        firebaseAdmin.messaging().send({
          token,
          notification: { title, body },
          data: data ?? {},
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
          android: { priority: 'high' },
        }),
      ),
    )
  } catch {
    // Non-fatal — push notification failures should never break the main flow
  }
}

/**
 * Insert a notification row AND send push in one call.
 * Prefer this over separate insert + sendPushToUser calls.
 */
export async function notifyUser(
  adminClient: SupabaseClient,
  opts: {
    userId: string
    type: string
    title: string
    body: string
    data?: Record<string, unknown>
  },
): Promise<void> {
  const { userId, type, title, body, data } = opts

  // Insert DB notification (for in-app notification centre)
  await adminClient.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    data: data ?? {},
  })

  // Fire-and-forget push — convert data values to strings for FCM
  const pushData = data
    ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      )
    : undefined

  sendPushToUser(adminClient, userId, title, body, pushData)
}
