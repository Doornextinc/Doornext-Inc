import { createAdminClient } from '@/lib/supabase/server'
import { ShoppingBag, DollarSign, Truck, UtensilsCrossed } from 'lucide-react'

async function getDashboardStats() {
  const supabase = createAdminClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [ordersToday, revenueToday, activeDrivers, openMakers, recentOrders] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabase
      .from('orders')
      .select('total')
      .gte('created_at', todayISO)
      .eq('status', 'delivered'),
    supabase
      .from('driver_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('food_makers')
      .select('id', { count: 'exact', head: true })
      .eq('is_open', true),
    supabase
      .from('orders')
      .select('id, status, total, created_at, food_maker:food_makers(display_name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const revenue = (revenueToday.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)

  return {
    ordersToday: ordersToday.count ?? 0,
    revenueToday: revenue,
    activeDrivers: activeDrivers.count ?? 0,
    openMakers: openMakers.count ?? 0,
    recentOrders: recentOrders.data ?? [],
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-purple-100 text-purple-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  on_the_way: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  const kpis = [
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingBag, color: 'text-blue-500 bg-blue-50' },
    { label: 'Revenue Today', value: `$${stats.revenueToday.toFixed(2)}`, icon: DollarSign, color: 'text-green-500 bg-green-50' },
    { label: 'Active Drivers', value: stats.activeDrivers, icon: Truck, color: 'text-[#FF6B35] bg-orange-50' },
    { label: 'Open Makers', value: stats.openMakers, icon: UtensilsCrossed, color: 'text-purple-500 bg-purple-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-5 mb-8">
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
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-bold text-gray-900">Recent Orders</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Order ID</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Maker</th>
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
                  #{order.id.slice(-8).toUpperCase()}
                </td>
                <td className="px-6 py-3 font-medium text-gray-800">
                  {order.food_maker?.display_name ?? '—'}
                </td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {order.status.replace('_', ' ')}
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
