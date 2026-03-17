import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '7')

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()

  const [
    ordersAll,
    revenueRows,
    usersCount,
    driversCount,
    dailyOrders,
    topMakers,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total, platform_fee, driver_payout, maker_payout, created_at', { count: 'exact' })
      .gte('created_at', sinceISO),
    supabase
      .from('orders')
      .select('total, platform_fee, service_fee, driver_payout, maker_payout, discount_amt, created_at')
      .gte('created_at', sinceISO)
      .eq('status', 'delivered'),
    supabase
      .from('users')
      .select('id, created_at', { count: 'exact', head: true }),
    supabase
      .from('driver_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('created_at, total, status')
      .gte('created_at', sinceISO)
      .order('created_at'),
    supabase
      .from('orders')
      .select('maker_id, total, food_makers(display_name)')
      .eq('status', 'delivered')
      .gte('created_at', sinceISO),
  ])

  const delivered = revenueRows.data ?? []
  const gmv = delivered.reduce((s, o) => s + (o.total ?? 0), 0)
  const platformFees = delivered.reduce((s, o) => s + (o.platform_fee ?? 0), 0)
  const serviceFees = delivered.reduce((s, o) => s + (o.service_fee ?? 0), 0)
  const driverPayouts = delivered.reduce((s, o) => s + (o.driver_payout ?? 0), 0)
  const makerPayouts = delivered.reduce((s, o) => s + (o.maker_payout ?? 0), 0)
  const discounts = delivered.reduce((s, o) => s + (o.discount_amt ?? 0), 0)
  const avgOrderValue = delivered.length ? gmv / delivered.length : 0

  // Daily revenue breakdown
  const dailyMap: Record<string, { date: string; revenue: number; orders: number }> = {}
  for (const o of dailyOrders.data ?? []) {
    const d = o.created_at.slice(0, 10)
    if (!dailyMap[d]) dailyMap[d] = { date: d, revenue: 0, orders: 0 }
    dailyMap[d].orders++
    if (o.status === 'delivered') dailyMap[d].revenue += o.total ?? 0
  }
  const dailyStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  // Top makers by revenue
  const makerRevMap: Record<string, { name: string; revenue: number; orders: number }> = {}
  for (const o of topMakers.data ?? []) {
    const mid = o.maker_id
    const name = (o.food_makers as { display_name: string } | null)?.display_name ?? 'Unknown'
    if (!makerRevMap[mid]) makerRevMap[mid] = { name, revenue: 0, orders: 0 }
    makerRevMap[mid].revenue += o.total ?? 0
    makerRevMap[mid].orders++
  }
  const topMakersList = Object.values(makerRevMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const allOrders = ordersAll.data ?? []
  const totalOrders = allOrders.length
  const deliveredCount = allOrders.filter((o) => o.status === 'delivered').length
  const cancelledCount = allOrders.filter((o) => o.status === 'cancelled').length
  const conversionRate = totalOrders ? (deliveredCount / totalOrders) * 100 : 0

  return NextResponse.json({
    period: { days, since: sinceISO },
    summary: {
      gmv: parseFloat(gmv.toFixed(2)),
      platformFees: parseFloat(platformFees.toFixed(2)),
      serviceFees: parseFloat(serviceFees.toFixed(2)),
      netRevenue: parseFloat((platformFees + serviceFees).toFixed(2)),
      driverPayouts: parseFloat(driverPayouts.toFixed(2)),
      makerPayouts: parseFloat(makerPayouts.toFixed(2)),
      discounts: parseFloat(discounts.toFixed(2)),
      totalOrders,
      deliveredCount,
      cancelledCount,
      conversionRate: parseFloat(conversionRate.toFixed(1)),
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      totalUsers: usersCount.count ?? 0,
      activeDrivers: driversCount.count ?? 0,
    },
    dailyStats,
    topMakers: topMakersList,
  })
}
