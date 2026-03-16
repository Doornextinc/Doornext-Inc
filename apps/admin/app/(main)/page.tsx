import { createAdminClient } from '@/lib/supabase/server'
import { ShoppingBag, DollarSign, Truck, UtensilsCrossed, Users, TrendingUp, BarChart2, Clock } from 'lucide-react'
import Link from 'next/link'

async function getDashboardStats() {
  const supabase = createAdminClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

  const [
    ordersToday,
    revenueToday,
    activeDrivers,
    openMakers,
    recentOrders,
    totalUsers,
    monthRevenue,
    pendingKYC,
    pendingWithdrawals,
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('orders').select('total').gte('created_at', todayISO).eq('status', 'delivered'),
    supabase.from('driver_profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('food_makers').select('id', { count: 'exact', head: true }).eq('is_open', true),
    supabase
      .from('orders')
      .select('id, status, total, created_at, food_maker:food_makers(display_name)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('total, platform_fee').gte('created_at', monthStart).eq('status', 'delivered'),
    supabase.from('driver_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const todayRevenue = (revenueToday.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)
  const gmvMonth = (monthRevenue.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)
  const platformFeesMonth = (monthRevenue.data ?? []).reduce((s, o) => s + (o.platform_fee ?? 0), 0)

  return {
    ordersToday: ordersToday.count ?? 0,
    revenueToday: todayRevenue,
    activeDrivers: activeDrivers.count ?? 0,
    openMakers: openMakers.count ?? 0,
    totalUsers: totalUsers.count ?? 0,
    gmvMonth,
    platformFeesMonth,
    pendingKYC: pendingKYC.count ?? 0,
    pendingWithdrawals: pendingWithdrawals.count ?? 0,
    recentOrders: recentOrders.data ?? [],
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-purple-100 text-purple-700',
  driver_assigned: 'bg-indigo-100 text-indigo-700',
  arrived_at_maker: 'bg-violet-100 text-violet-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  on_the_way: 'bg-cyan-100 text-cyan-700',
  arrived_at_customer: 'bg-teal-100 text-teal-700',
  failed_delivery: 'bg-red-100 text-red-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  const kpis = [
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingBag, color: 'text-blue-500 bg-blue-50' },
    { label: 'Revenue Today', value: `$${stats.revenueToday.toFixed(2)}`, icon: DollarSign, color: 'text-green-500 bg-green-50' },
    { label: 'Active Drivers', value: stats.activeDrivers, icon: Truck, color: 'text-[#FF6B35] bg-orange-50' },
    { label: 'Open Sellers', value: stats.openMakers, icon: UtensilsCrossed, color: 'text-purple-500 bg-purple-50' },
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'text-indigo-500 bg-indigo-50' },
    { label: 'GMV This Month', value: `$${stats.gmvMonth.toFixed(0)}`, icon: TrendingUp, color: 'text-teal-500 bg-teal-50' },
    { label: 'Platform Fees (Mo)', value: `$${stats.platformFeesMonth.toFixed(2)}`, icon: BarChart2, color: 'text-pink-500 bg-pink-50' },
    { label: 'KYC / Withdrawals', value: `${stats.pendingKYC} / ${stats.pendingWithdrawals}`, icon: Clock, color: 'text-amber-500 bg-amber-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          {stats.pendingKYC > 0 && (
            <Link href="/operations/kyc" className="text-xs font-semibold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
              {stats.pendingKYC} KYC pending
            </Link>
          )}
          {stats.pendingWithdrawals > 0 && (
            <Link href="/operations/withdrawals" className="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              {stats.pendingWithdrawals} withdrawals pending
            </Link>
          )}
        </div>
      </div>

      {/* KPI Grid — 4 columns × 2 rows */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon size={20} />
            </div>
            <p className="text-2xl font-black text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Recent Orders</h2>
          <Link href="/operations/orders" className="text-xs text-[#FF6B35] font-semibold hover:underline">
            View all →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Order ID</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Seller</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="text-right px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
              <th className="text-right px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stats.recentOrders.map((order: {
              id: string
              status: string
              total: number
              created_at: string
              food_maker: { display_name: string } | null
            }) => (
              <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-3 font-mono text-xs text-gray-500">
                  <Link href={`/operations/orders/${order.id}`} className="hover:text-[#FF6B35]">
                    #{order.id.slice(-8).toUpperCase()}
                  </Link>
                </td>
                <td className="px-6 py-3 font-medium text-gray-800">
                  {order.food_maker?.display_name ?? '—'}
                </td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-3 text-right font-bold text-gray-900">
                  ${order.total?.toFixed(2) ?? '—'}
                </td>
                <td className="px-6 py-3 text-right text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
