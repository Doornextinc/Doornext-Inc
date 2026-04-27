import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OrderStatusChanger } from './status-changer'

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

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select(`
      *,
      food_maker:food_makers(id, display_name, lat, lng),
      customer:users!orders_customer_id_fkey(id, full_name, email, phone),
      order_items(
        id, quantity, unit_price,
        menu_item:menu_items(name)
      )
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  // Fetch driver profile if order has nexter_id
  let driver = null
  if (order.nexter_id) {
    const { data } = await supabase
      .from('driver_profiles')
      .select('id, full_name, vehicle_type, avg_rating, total_deliveries')
      .eq('id', order.nexter_id)
      .single()
    driver = data
  }

  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
  const maker = Array.isArray(order.food_maker) ? order.food_maker[0] : order.food_maker
  const items = Array.isArray(order.order_items) ? order.order_items : []
  const addr = typeof order.delivery_address === 'object' && order.delivery_address
    ? order.delivery_address as Record<string, string>
    : null

  const VEHICLE_ICONS: Record<string, string> = { car: '🚗', bike: '🚲', foot: '🚶' }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← Orders
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-mono text-gray-600">#{order.id.slice(-8).toUpperCase()}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 mb-1">Order #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-sm text-gray-400">
            Placed {new Date(order.created_at).toLocaleString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
          STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'
        }`}>
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-3">
              {items.map((item: Record<string, unknown>) => {
                const menuItem = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
                const unitPrice = typeof item.unit_price === 'number' ? item.unit_price : 0
                const qty = typeof item.quantity === 'number' ? item.quantity : 0
                return (
                  <div key={item.id as string} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {qty}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {(menuItem as Record<string, unknown>)?.name as string ?? 'Unknown Item'}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      ${(unitPrice * qty).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>${(order.total - order.delivery_fee).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Delivery fee</span>
                <span>${order.delivery_fee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-gray-900 text-base pt-1 border-t border-gray-100">
                <span>Total</span>
                <span>${order.total?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          {addr && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3">Delivery Address</h2>
              <p className="text-gray-700">{addr.street}</p>
              <p className="text-gray-500 text-sm">{addr.city}, {addr.state} {addr.zip}</p>
              {addr.label && <p className="text-xs text-gray-400 mt-1">{addr.label}</p>}
              {addr.instructions && (
                <p className="text-xs text-gray-500 mt-2 italic">"{addr.instructions}"</p>
              )}
            </div>
          )}

          {/* Stripe */}
          {order.stripe_payment_intent_id && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3">Payment</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Stripe Payment Intent</p>
                  <p className="font-mono text-xs text-gray-600">{order.stripe_payment_intent_id}</p>
                </div>
                {order.status !== 'cancelled' && (
                  <form action="/api/admin/refund" method="POST">
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      className="text-sm text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors border border-red-200"
                      onClick={(e) => {
                        if (!confirm('Issue a full refund for this order?')) e.preventDefault()
                      }}
                    >
                      Issue Refund
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Customer, Maker, Driver */}
        <div className="space-y-4">
          {/* Customer */}
          {customer && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Customer</h2>
              <p className="font-bold text-gray-900">{(customer as Record<string, unknown>).full_name as string}</p>
              <p className="text-sm text-gray-500 mt-1">{(customer as Record<string, unknown>).email as string}</p>
              {!!(customer as Record<string, unknown>).phone && (
                <p className="text-sm text-gray-500">{(customer as Record<string, unknown>).phone as string}</p>
              )}
              <Link
                href={`/users?search=${encodeURIComponent((customer as Record<string, unknown>).email as string ?? '')}`}
                className="mt-3 block text-xs text-blue-500 hover:text-blue-700 font-semibold"
              >
                View profile →
              </Link>
            </div>
          )}

          {/* Maker */}
          {maker && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Food Maker</h2>
              <p className="font-bold text-gray-900">{(maker as Record<string, unknown>).display_name as string}</p>
              <Link
                href="/makers"
                className="mt-3 block text-xs text-blue-500 hover:text-blue-700 font-semibold"
              >
                View makers →
              </Link>
            </div>
          )}

          {/* Driver */}
          {driver ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Driver</h2>
              <p className="font-bold text-gray-900">{driver.full_name}</p>
              {driver.vehicle_type && (
                <p className="text-sm text-gray-500 mt-1">
                  {VEHICLE_ICONS[driver.vehicle_type] ?? ''} {driver.vehicle_type}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {driver.total_deliveries} deliveries · ⭐ {driver.avg_rating.toFixed(1)}
              </p>
              <Link
                href="/drivers"
                className="mt-3 block text-xs text-blue-500 hover:text-blue-700 font-semibold"
              >
                View drivers →
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Driver</h2>
              <p className="text-sm text-gray-400 italic">Not yet assigned</p>
            </div>
          )}

          {/* Status changer */}
          <OrderStatusChanger orderId={order.id} currentStatus={order.status} />

          {/* Timestamps */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Timeline</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Created</span>
                <span className="text-gray-700 font-medium">
                  {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last updated</span>
                <span className="text-gray-700 font-medium">
                  {new Date(order.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
