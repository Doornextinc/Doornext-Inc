import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? '30d'

  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()

  const { data: orders, error } = await supabase
    .from('orders')
    // tip_amount fetched separately — driver_payout is base pay only (tip stamped at $0 at creation)
    .select('total, platform_fee, service_fee, driver_payout, tip_amount, maker_payout, discount_amt, status, created_at')
    .gte('created_at', sinceISO)
    .eq('status', 'delivered')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = orders ?? []
  const gmv = rows.reduce((s, o) => s + (o.total ?? 0), 0)
  const platformFees = rows.reduce((s, o) => s + (o.platform_fee ?? 0), 0)
  const serviceFees = rows.reduce((s, o) => s + (o.service_fee ?? 0), 0)
  // driver_payout is base pay only; add tip_amount to get actual driver earnings
  const driverPayouts = rows.reduce((s, o) => s + (o.driver_payout ?? 0) + (o.tip_amount ?? 0), 0)
  const tipPayouts = rows.reduce((s, o) => s + (o.tip_amount ?? 0), 0)
  const makerPayouts = rows.reduce((s, o) => s + (o.maker_payout ?? 0), 0)
  const discounts = rows.reduce((s, o) => s + (o.discount_amt ?? 0), 0)

  // Daily breakdown
  const dailyMap: Record<string, {
    date: string
    gmv: number
    platform_fees: number
    driver_payouts: number
    maker_payouts: number
    orders: number
  }> = {}

  for (const o of rows) {
    const d = o.created_at.slice(0, 10)
    if (!dailyMap[d]) {
      dailyMap[d] = { date: d, gmv: 0, platform_fees: 0, driver_payouts: 0, maker_payouts: 0, orders: 0 }
    }
    dailyMap[d].gmv += o.total ?? 0
    dailyMap[d].platform_fees += (o.platform_fee ?? 0) + (o.service_fee ?? 0)
    dailyMap[d].driver_payouts += (o.driver_payout ?? 0) + (o.tip_amount ?? 0)
    dailyMap[d].maker_payouts += o.maker_payout ?? 0
    dailyMap[d].orders++
  }

  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    period: { days, since: sinceISO },
    summary: {
      gmv: parseFloat(gmv.toFixed(2)),
      platformFees: parseFloat(platformFees.toFixed(2)),
      serviceFees: parseFloat(serviceFees.toFixed(2)),
      netRevenue: parseFloat((platformFees + serviceFees).toFixed(2)),
      driverPayouts: parseFloat(driverPayouts.toFixed(2)),
      tipPayouts: parseFloat(tipPayouts.toFixed(2)),
      makerPayouts: parseFloat(makerPayouts.toFixed(2)),
      discounts: parseFloat(discounts.toFixed(2)),
      totalOrders: rows.length,
    },
    daily,
  })
}
