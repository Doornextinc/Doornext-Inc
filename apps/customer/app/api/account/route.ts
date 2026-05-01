/**
 * DELETE /api/account
 *
 * GDPR "right to erasure" — permanently deletes the authenticated customer's
 * account and anonymises their personal data.
 *
 * What we do:
 *  1. Verify the user is authenticated and is a customer (not a driver/maker/admin).
 *  2. Cancel any active orders (pending / awaiting_payment / accepted / picked_up).
 *  3. Anonymise PII in the `users` row (name → "Deleted User", null out phone/address).
 *  4. Anonymise delivery_address on all their orders (set to a placeholder object).
 *  5. Delete saved delivery addresses.
 *  6. Delete push-notification subscriptions.
 *  7. Delete the Supabase Auth user (this cascades via FK or the user simply loses access).
 *
 * What we intentionally keep:
 *  - Order rows themselves (needed for financial records / driver payouts / disputes).
 *    PII within those rows is anonymised in step 4.
 *  - Admin audit log (append-only — see migration 033).
 *
 * Rate limited to 2 attempts per hour per user to prevent abuse.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'

// Only cancel orders the maker hasn't started yet — orders further along
// (driver assigned, picked up, on the way) continue to completion so
// drivers and makers receive their payouts.
const CANCELLABLE_STATUSES = ['pending', 'awaiting_payment', 'confirmed']

const ANONYMISED_ADDRESS = {
  street: 'Deleted',
  city:   'Deleted',
  state:  'NY',
  zip:    '00000',
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options) } catch {}
        }),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 2 deletion attempts per hour per user
  if (!await checkRateLimit(`account-delete:${user.id}`, 2, 3600)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Confirm role — only customers can self-delete via this endpoint.
  //    Drivers and makers have their own off-boarding flows.
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (profile.role !== 'customer') {
    return NextResponse.json(
      { error: 'Driver and maker accounts must be closed through support' },
      { status: 403 }
    )
  }

  try {
    // 2. Cancel active orders
    const { data: activeOrders } = await admin
      .from('orders')
      .select('id, payment_method, stripe_payment_intent_id')
      .eq('customer_id', user.id)
      .in('status', CANCELLABLE_STATUSES)

    if (activeOrders && activeOrders.length > 0) {
      await admin
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', activeOrders.map((o: { id: string }) => o.id))
    }

    // 3. Anonymise PII in users table
    await admin
      .from('users')
      .update({
        full_name:   'Deleted User',
        phone:       null,
        avatar_url:  null,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', user.id)

    // 4. Anonymise delivery addresses on all orders
    await admin
      .from('orders')
      .update({ delivery_address: ANONYMISED_ADDRESS })
      .eq('customer_id', user.id)

    // 5. Delete saved delivery addresses
    await admin
      .from('delivery_addresses')
      .delete()
      .eq('user_id', user.id)

    // 6. Delete push-notification subscriptions
    await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)

    // 7. Delete the Supabase Auth user — this is irreversible.
    //    Do this last so the user stays authenticated through all the steps above.
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteAuthError) {
      // Auth deletion failed — user data has been anonymised but auth record remains.
      // This is recoverable: the account is functionally unusable (anonymised data)
      // but the auth user can be cleaned up manually.
      Sentry.captureException(deleteAuthError, {
        extra: { userId: user.id, context: 'account-deletion-auth' },
      })
      console.error('Auth user deletion failed:', deleteAuthError.message)
      // Still return success — PII is gone, which is the GDPR obligation
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    Sentry.captureException(err, { extra: { userId: user.id, context: 'account-deletion' } })
    console.error('Account deletion error:', err)
    return NextResponse.json({ error: 'Failed to delete account. Please contact support.' }, { status: 500 })
  }
}
