'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Order {
  id: string
  status: string
  payment_method?: 'card' | 'cash'
  total: number
  created_at: string
  food_maker: { display_name: string } | null
  nexter_id: string | null
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
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const ALL_STATUSES = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer', 'delivered', 'cancelled']

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/orders?${params}`)
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders ?? [])
    }
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Orders</h1>
        <span className="text-sm text-gray-400">{orders.length} shown</span>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="search"
          placeholder="Search order ID or seller…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors w-64"
        />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Order ID</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Seller</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Payment</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Total</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">
                    #{order.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    {order.food_maker?.display_name ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {order.payment_method === 'cash' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        💵 Cash
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                        💳 Card
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {order.nexter_id ? '🚗 Assigned' : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">
                    ${order.total?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/operations/orders/${order.id}`}
                      className="text-xs font-semibold text-[#FF6B35] hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
