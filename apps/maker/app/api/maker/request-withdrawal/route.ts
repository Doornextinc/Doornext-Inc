import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 5 withdrawal requests per hour per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`maker-withdrawal:${ip}`, 5, 3600)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify maker role
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'maker') {
    return NextResponse.json({ error: 'Not a maker account' }, { status: 403 })
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

  // Check for existing pending withdrawal
  const { data: existing } = await admin
    .from('withdrawals')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'You already have a pending withdrawal request' }, { status: 409 })
  }

  // Get the maker's food_makers row
  const { data: maker } = await admin
    .from('food_makers')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!maker) {
    return NextResponse.json({ error: 'Maker profile not found' }, { status: 404 })
  }

  // Balance validation: available = sum of maker_payout from delivered orders
  //                               - sum of all non-rejected withdrawal amounts
  const [{ data: delivered }, { data: withdrawn }] = await Promise.all([
    admin
      .from('orders')
      .select('maker_payout')
      .eq('maker_id', maker.id)
      .eq('status', 'delivered'),
    admin
      .from('withdrawals')
      .select('amount')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved', 'paid']),
  ])

  const totalEarned = (delivered ?? []).reduce(
    (s: number, o: { maker_payout: number | null }) => s + (o.maker_payout ?? 0), 0
  )
  const totalWithdrawn = (withdrawn ?? []).reduce(
    (s: number, w: { amount: number }) => s + w.amount, 0
  )
  const availableBalance = Math.round((totalEarned - totalWithdrawn) * 100) / 100

  if (amount > availableBalance) {
    return NextResponse.json(
      { error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` },
      { status: 400 }
    )
  }

  const { data, error } = await admin
    .from('withdrawals')
    .insert({
      user_id:   user.id,
      user_role: 'maker',
      amount:    Math.round(amount * 100) / 100,
      method,
      status:    'pending',
    })
    .select('id')
    .single()

  if (error) {
    Sentry.captureException(error, { extra: { userId: user.id, amount, method } })
    return NextResponse.json({ error: 'Failed to submit withdrawal request' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}
