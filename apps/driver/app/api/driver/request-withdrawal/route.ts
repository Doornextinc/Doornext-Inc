import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit per authenticated user: 5 withdrawal requests per hour.
  // Using userId (not IP) so drivers on shared networks don't block each other.
  if (!await checkRateLimit(`request-withdrawal:${user.id}`, 5, 3600)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Verify driver role
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'driver') {
    return NextResponse.json({ error: 'Not a driver account' }, { status: 403 })
  }

  const { amount, method } = await req.json()
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }
  if (!method || !['bank_transfer', 'stripe'].includes(method)) {
    return NextResponse.json({ error: 'Invalid payout method' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delegate balance check + pending check + insert to DB RPC.
  // The function acquires a per-user advisory lock, so concurrent requests
  // serialize safely without a read-modify-write race window.
  const { data: withdrawalId, error: rpcError } = await admin.rpc(
    'request_withdrawal_atomic',
    {
      p_user_id: user.id,
      p_amount:  Math.round(amount * 100) / 100,
      p_method:  method,
    }
  )

  if (rpcError) {
    const msg = rpcError.message ?? ''

    if (msg.includes('PENDING_EXISTS')) {
      return NextResponse.json(
        { error: 'You already have a pending withdrawal request' },
        { status: 409 }
      )
    }

    if (msg.includes('INSUFFICIENT_BALANCE')) {
      // Message format: 'INSUFFICIENT_BALANCE:<available>'
      const available = msg.split(':')[1] ?? '0'
      return NextResponse.json(
        { error: `Insufficient balance. Available: $${parseFloat(available).toFixed(2)}` },
        { status: 400 }
      )
    }

    Sentry.captureException(rpcError, { extra: { userId: user.id, amount, method } })
    return NextResponse.json({ error: 'Failed to submit withdrawal request' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: withdrawalId })
}
