'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, RefreshCw, CheckCircle, Loader2, ChevronDown } from 'lucide-react'

const ACTIVE_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker', 'picked_up',
  'on_the_way', 'arrived_at_customer',
]

const ALL_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker', 'picked_up',
  'on_the_way', 'arrived_at_customer',
  'delivered', 'failed_delivery', 'cancelled',
] as const

type OrderStatus = typeof ALL_STATUSES[number]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:             'Pending',
  confirmed:           'Confirmed',
  preparing:           'Preparing',
  ready:               'Ready for pickup',
  driver_assigned:     'Driver assigned',
  arrived_at_maker:    'Driver at maker',
  picked_up:           'Picked up',
  on_the_way:          'On the way',
  arrived_at_customer: 'Arrived at customer',
  delivered:           'Delivered',
  failed_delivery:     'Failed delivery',
  cancelled:           'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  pending:             'bg-yellow-100 text-yellow-700',
  confirmed:           'bg-blue-100 text-blue-700',
  preparing:           'bg-orange-100 text-orange-700',
  ready:               'bg-purple-100 text-purple-700',
  driver_assigned:     'bg-indigo-100 text-indigo-700',
  arrived_at_maker:    'bg-violet-100 text-violet-700',
  picked_up:           'bg-indigo-100 text-indigo-700',
  on_the_way:          'bg-cyan-100 text-cyan-700',
  arrived_at_customer: 'bg-teal-100 text-teal-700',
  failed_delivery:     'bg-red-100 text-red-700',
  delivered:           'bg-green-100 text-green-700',
  cancelled:           'bg-red-100 text-red-700',
}

interface Order {
  id: string
  status: string
  total: number
  created_at: string
  nexter_id: string | null
  food_maker: { display_name: string } | null
  customer: { full_name: string; email: string } | null
}

interface RowState {
  selected: OrderStatus
  saving: boolean
  saved: boolean
  error: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function OrdersSupportPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  const load = useCallback(async (q: string, active: boolean) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q.trim()) params.set('search', q.trim().replace(/^#/, ''))
    // If active-only, don't pass a single status — fetch all and filter client-side
    // (API supports single status filter only; we filter the non-terminal ones here)
    const res = await fetch(`/api/admin/orders?${params}`)
    if (res.ok) {
      const data = await res.json()
      const all: Order[] = data.orders ?? []
      const filtered = active
        ? all.filter((o) => ACTIVE_STATUSES.includes(o.status))
        : all
      setOrders(filtered)
      // Seed row states for any new orders
      setRowStates((prev) => {
        const next = { ...prev }
        for (const o of filtered) {
          if (!next[o.id]) {
            next[o.id] = { selected: o.status as OrderStatus, saving: false, saved: false, error: null }
          }
        }
        return next
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load(debouncedQuery, activeOnly)
  }, [debouncedQuery, activeOnly, load])

  // Auto-focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  const setRowSelected = (id: string, status: OrderStatus) => {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], selected: status, saved: false, error: null },
    }))
  }

  const saveStatus = async (order: Order) => {
    const row = rowStates[order.id]
    if (!row || row.selected === order.status) return

    setRowStates((prev) => ({ ...prev, [order.id]: { ...prev[order.id], saving: true, error: null } }))

    const res = await fetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: row.selected }),
    })
    const data = await res.json()

    if (!res.ok) {
      setRowStates((prev) => ({
        ...prev,
        [order.id]: { ...prev[order.id], saving: false, error: data.error ?? 'Failed' },
      }))
      return
    }

    // Update the order in-place and mark saved
    setOrders((prev) =>
      activeOnly && !ACTIVE_STATUSES.includes(row.selected)
        ? prev.filter((o) => o.id !== order.id)   // remove from active list
        : prev.map((o) => o.id === order.id ? { ...o, status: row.selected } : o)
    )
    setRowStates((prev) => ({
      ...prev,
      [order.id]: { ...prev[order.id], saving: false, saved: true },
    }))
    setTimeout(() => {
      setRowStates((prev) => ({ ...prev, [order.id]: { ...prev[order.id], saved: false } }))
    }, 2500)
  }

  return (
    <div className="p-8 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Order Support</h1>
          <p className="text-sm text-gray-400 mt-1">Search an order and update its status directly</p>
        </div>
        <button
          onClick={() => load(debouncedQuery, activeOnly)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order # or ID…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* Active-only toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setActiveOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeOnly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Active only
          </button>
          <button
            onClick={() => setActiveOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              !activeOnly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All orders
          </button>
        </div>

        {loading && <Loader2 size={16} className="text-gray-400 animate-spin" />}
        {!loading && <span className="text-xs text-gray-400 font-medium">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading && orders.length === 0 ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {query ? `No orders found for "${query}"` : 'No active orders right now'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Order</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Maker</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Current Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Placed</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide w-72">Change Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => {
                const row = rowStates[order.id]
                const isDirty = row && row.selected !== order.status
                const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
                const maker = Array.isArray(order.food_maker) ? order.food_maker[0] : order.food_maker
                const minutesAgo = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
                const ageLabel = minutesAgo < 60
                  ? `${minutesAgo}m ago`
                  : minutesAgo < 1440
                    ? `${Math.floor(minutesAgo / 60)}h ago`
                    : new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                return (
                  <tr
                    key={order.id}
                    className={`transition-colors ${row?.saved ? 'bg-green-50/60' : 'hover:bg-gray-50/50'}`}
                  >
                    {/* Order # */}
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-lg">
                        #{order.id.slice(-8).toUpperCase()}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800 text-sm leading-tight">
                        {customer?.full_name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{customer?.email ?? ''}</p>
                    </td>

                    {/* Maker */}
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {maker?.display_name ?? '—'}
                    </td>

                    {/* Current status badge */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'
                      }`}>
                        {STATUS_LABELS[order.status as OrderStatus] ?? order.status.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Placed */}
                    <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {ageLabel}
                    </td>

                    {/* Status changer */}
                    <td className="px-5 py-3.5">
                      {row ? (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={row.selected}
                              onChange={(e) => setRowSelected(order.id, e.target.value as OrderStatus)}
                              disabled={row.saving}
                              className="appearance-none pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {ALL_STATUSES.map((s) => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>

                          {isDirty && (
                            <button
                              onClick={() => saveStatus(order)}
                              disabled={row.saving}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {row.saving ? <Loader2 size={11} className="animate-spin" /> : null}
                              {row.saving ? 'Saving…' : 'Save'}
                            </button>
                          )}

                          {row.saved && !isDirty && (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                              <CheckCircle size={13} />
                              Updated
                            </span>
                          )}

                          {row.error && (
                            <span className="text-xs text-red-500 font-medium">{row.error}</span>
                          )}
                        </div>
                      ) : null}
                    </td>

                    {/* Detail link */}
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/operations/orders/${order.id}`}
                        className="text-xs font-semibold text-[#FF6B35] hover:underline whitespace-nowrap"
                      >
                        Full detail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Helper note */}
      <p className="text-xs text-gray-400 mt-4">
        Status changes take effect immediately. Changing to <strong>delivered</strong> or <strong>cancelled</strong> will remove the order from the active list.
      </p>
    </div>
  )
}
