import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { RefundButton } from './refund-button'

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
  searchParams: Promise<{ status?: string; page?: string }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const { status, page } = await searchParams
  const pageNum = parseInt(page ?? '1', 10)
  const limit = 50
  const offset = (pageNum - 1) * limit

  const supabase = createAdminClient()
  let query = supabase
    .from('orders')
    .select(`
      id, status, total, created_at, customer_id, stripe_payment_intent_id,
      food_maker:food_makers(display_name),
      customer:users!orders_customer_id_fkey(full_name, email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data: orders, count } = await query

  const totalPages = Math.ceil((count ?? 0) / limit)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Orders</h1>
        <span className="text-sm text-gray-400">{count ?? 0} total</span>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer', 'delivered', 'failed_delivery', 'cancelled'].map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/orders' : `/orders?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              (s === 'all' && !status) || status === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.replace('_', ' ')}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Order</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Customer</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Maker</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Date</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(orders ?? []).map((order) => {
              const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
              const maker = Array.isArray(order.food_maker) ? order.food_maker[0] : order.food_maker
              return (
                <tr key={order.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">#{order.id.slice(-8).toUpperCase()}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{customer?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{customer?.email ?? ''}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{maker?.display_name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'
                    }`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">${order.total?.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-xs text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        View
                      </Link>
                      {order.stripe_payment_intent_id && order.status !== 'cancelled' && (
                        <RefundButton orderId={order.id} />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-400">Page {pageNum} of {totalPages}</p>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Link href={`/orders?page=${pageNum - 1}${status ? `&status=${status}` : ''}`}
                  className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
                  Previous
                </Link>
              )}
              {pageNum < totalPages && (
                <Link href={`/orders?page=${pageNum + 1}${status ? `&status=${status}` : ''}`}
                  className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
