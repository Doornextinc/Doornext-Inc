import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Check for existing pending withdrawal
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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

  // Balance validation: ensure the driver has sufficient available balance.
  // Available = sum of driver_payout from delivered orders (includes surge/tip share)
  //           - sum of all non-rejected withdrawal amounts.
  const [{ data: delivered }, { data: withdrawn }] = await Promise.all([
    admin
      .from('orders')
      .select('driver_payout')
      .eq('nexter_id', user.id)
      .eq('status', 'delivered'),
    admin
      .from('withdrawals')
      .select('amount')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved', 'paid']),
  ])

  const totalEarned = (delivered ?? []).reduce((s: number, o: { driver_payout: number | null }) => s + (o.driver_payout ?? 0), 0)
  const totalWithdrawn = (withdrawn ?? []).reduce((s: number, w: { amount: number }) => s + w.amount, 0)
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
      user_role: 'driver',
      amount:    Math.round(amount * 100) / 100,
      method,
      status:    'pending',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to submit withdrawal request' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}
