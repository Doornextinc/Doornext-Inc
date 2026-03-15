'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface OrderDetail {
  id: string
  status: string
  payment_method?: 'card' | 'cash'
  total: number
  subtotal?: number
  delivery_fee?: number
  tip_amount?: number
  platform_fee?: number
  service_fee?: number
  driver_payout?: number
  maker_payout?: number
  discount_amt?: number
  surge_multiplier?: number
  created_at: string
  updated_at?: string
  nexter_id: string | null
  food_maker: { display_name: string } | null
  order_items: { quantity: number; unit_price: number; customization_notes?: string | null; menu_items: { name: string; price?: number } | null }[]
  customer: { full_name: string; email: string } | null
  driver: { full_name?: string; vehicle_type?: string; avg_rating?: number } | null
  promo?: { code: string; discount_type: string; discount_value: number } | null
  price_tier?: { name: string; base_fee: number } | null
}

interface DriverLocation { lat: number; lng: number; updated_at: string }

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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [refunding, setRefunding] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${id}`)
    if (res.ok) {
      const data = await res.json()
      setOrder(data.order)
      setDriverLocation(data.driverLocation)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Poll driver location every 15s when order is active
  useEffect(() => {
    if (!order?.nexter_id || ['delivered', 'cancelled'].includes(order.status)) return
    const interval = setInterval(() => load(), 15000)
    return () => clearInterval(interval)
  }, [order, load])

  const refund = async () => {
    if (!confirm('Issue a full refund for this order?')) return
    setRefunding(true)
    await fetch('/api/admin/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id }),
    })
    setRefunding(false)
    load()
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1,2,3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!order) {
    return <div className="p-8 text-center text-gray-400">Order not found</div>
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/operations/orders" className="text-sm text-gray-400 hover:text-gray-600">← Orders</Link>
        <span className="text-gray-200">/</span>
        <span className="font-mono text-sm text-gray-600">#{order.id.slice(-8).toUpperCase()}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
          STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
        }`}>
          {order.status.replace(/_/g, ' ')}
        </span>
        <div className="ml-auto">
          <button
            onClick={refund}
            disabled={refunding || order.status === 'cancelled'}
            className="text-sm font-semibold px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {refunding ? 'Processing…' : 'Issue Refund'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-2">
              {order.order_items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{item.menu_items?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">× {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-gray-900 text-sm">
                    ${(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4">Financial Breakdown</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Subtotal', value: `$${order.total?.toFixed(2)}` },
                { label: 'Promo Discount', value: `-$${order.discount_amt?.toFixed(2)}`, hide: !order.discount_amt },
                { label: 'Surge Multiplier', value: `${order.surge_multiplier}×`, hide: order.surge_multiplier === 1 },
                { label: 'Price Tier', value: order.price_tier?.name ?? '—' },
                { label: 'Platform Fee', value: `$${order.platform_fee?.toFixed(2)}` },
                { label: 'Driver Payout', value: `$${order.driver_payout?.toFixed(2)}` },
                { label: 'Seller Payout', value: `$${order.maker_payout?.toFixed(2)}` },
              ].filter((r) => !r.hide).map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Customer</h3>
            <p className="font-medium text-gray-900">{order.customer?.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400">{order.customer?.email ?? '—'}</p>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-2 text-sm">Payment</h3>
            {order.payment_method === 'cash' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg">
                💵 Cash on Delivery
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg">
                💳 Card (Stripe)
              </span>
            )}
          </div>

          {/* Seller */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Seller</h3>
            <p className="font-medium text-gray-900">{order.food_maker?.display_name ?? '—'}</p>
          </div>

          {/* Driver */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Driver</h3>
            {order.driver ? (
              <>
                <p className="font-medium text-gray-900">{order.driver.full_name ?? '—'}</p>
                <p className="text-xs text-gray-400">{order.driver.vehicle_type} · ⭐ {order.driver.avg_rating?.toFixed(1)}</p>
                {driverLocation && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Live Location</p>
                    <p className="text-xs text-blue-600 font-mono">
                      {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
                    </p>
                    <p className="text-[10px] text-blue-400 mt-1">
                      Updated {new Date(driverLocation.updated_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No driver assigned</p>
            )}
          </div>

          {/* Promo */}
          {order.promo && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-2 text-sm">Promo Used</h3>
              <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 text-xs font-mono font-bold rounded-lg">
                {order.promo.code}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                {order.promo.discount_type === 'percent'
                  ? `${order.promo.discount_value}% off`
                  : `$${order.promo.discount_value} off`}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Timestamps</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Placed</span>
                <span className="font-medium text-gray-700">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
