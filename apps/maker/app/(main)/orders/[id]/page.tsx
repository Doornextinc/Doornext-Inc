'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@doornext/shared/types'
import {
  ChevronLeft, Check, X, ChefHat, MapPin, Clock,
  CreditCard, Banknote, CheckCircle, Circle, Loader2,
  Timer, Package, AlertCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
type OrderDetail = {
  id: string
  status: OrderStatus
  created_at: string
  updated_at: string
  total: number
  subtotal: number
  delivery_fee: number
  tip_amount: number
  platform_fee: number
  customer_id: string
  maker_id: string
  payment_method?: 'card' | 'cash'
  delivery_address: { street?: string; city?: string; state?: string; zip?: string } | null
  order_items: Array<{
    quantity: number
    unit_price: number
    customization_notes: string | null
    menu_item: { name: string; description: string | null } | null
  }>
}

// ─── Status machine ───────────────────────────────────────────────────────────
const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'pending',   label: 'Received'  },
  { key: 'confirmed', label: 'Accepted'  },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready',     label: 'Ready'     },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'delivered', label: 'Delivered' },
]

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
}

const ACTION_CONFIG: Partial<Record<OrderStatus, {
  label: string; bg: string; icon: React.ReactNode
}>> = {
  pending:   { label: 'Accept Order',    bg: 'bg-blue-500',    icon: <Check size={18} strokeWidth={3} /> },
  confirmed: { label: 'Start Preparing', bg: 'bg-[#FF6B35]',   icon: <ChefHat size={18} /> },
  preparing: { label: 'Mark as Ready',   bg: 'bg-emerald-500', icon: <Check size={18} strokeWidth={3} /> },
}

const STATE_BANNER: Partial<Record<OrderStatus, {
  bg: string; dot: string; title: string; sub: (mins: number) => string
}>> = {
  pending: {
    bg: 'bg-red-50 border-red-100',
    dot: 'bg-red-500',
    title: 'New Order — needs your attention!',
    sub: (m) => `Received ${m} min${m !== 1 ? 's' : ''} ago`,
  },
  confirmed: {
    bg: 'bg-blue-50 border-blue-100',
    dot: 'bg-blue-500',
    title: 'Order accepted',
    sub: (m) => `Waiting ${m} min${m !== 1 ? 's' : ''} — start cooking when ready`,
  },
  preparing: {
    bg: 'bg-orange-50 border-orange-100',
    dot: 'bg-[#FF6B35]',
    title: 'Cooking in progress',
    sub: (m) => `Preparing for ${m} min${m !== 1 ? 's' : ''}`,
  },
  ready: {
    bg: 'bg-emerald-50 border-emerald-100',
    dot: 'bg-emerald-500',
    title: 'Ready for driver pickup!',
    sub: (m) => `Marked ready ${m} min${m !== 1 ? 's' : ''} ago`,
  },
  picked_up: {
    bg: 'bg-purple-50 border-purple-100',
    dot: 'bg-purple-500',
    title: 'Picked up by driver',
    sub: (m) => `On the way for ${m} min${m !== 1 ? 's' : ''}`,
  },
  on_the_way: {
    bg: 'bg-purple-50 border-purple-100',
    dot: 'bg-purple-500',
    title: 'Driver on the way',
    sub: (m) => `In transit for ${m} min${m !== 1 ? 's' : ''}`,
  },
  delivered: {
    bg: 'bg-gray-50 border-gray-100',
    dot: 'bg-gray-400',
    title: 'Order delivered!',
    sub: () => 'Completed',
  },
  cancelled: {
    bg: 'bg-red-50 border-red-100',
    dot: 'bg-red-400',
    title: 'Order cancelled',
    sub: () => 'This order was cancelled',
  },
}

function elapsedMins(fromIso: string) {
  return Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000)
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectConfirm, setRejectConfirm] = useState(false)
  const [tick, setTick] = useState(0) // drives elapsed-time re-renders
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // ── Load order ──────────────────────────────────────────────────────────────
  const loadOrder = useCallback(async () => {
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('orders')
      .select(`
        *,
        payment_method,
        order_items(
          quantity, unit_price, customization_notes,
          menu_item:menu_items(name, description)
        )
      `)
      .eq('id', id)
      .single()
    if (err) console.error('Failed to load order:', err)
    if (data) setOrder(data as OrderDetail)
    setLoading(false)
  }, [id])

  useEffect(() => { loadOrder() }, [loadOrder])

  // ── Real-time subscription for this order ───────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`maker-order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          setOrder((prev) => prev
            ? { ...prev, status: payload.new.status as OrderStatus, updated_at: payload.new.updated_at }
            : prev
          )
        }
      )
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [id])

  // ── 30-second ticker for elapsed time display ───────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleAdvance = async () => {
    if (!order) return
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setUpdating(true); setError(null)
    try {
      const res = await fetch('/api/maker/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status: next }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to update status')
      } else {
        setOrder((prev) => prev ? { ...prev, status: next, updated_at: new Date().toISOString() } : prev)
      }
    } finally {
      setUpdating(false)
    }
  }

  const handleReject = async () => {
    if (!order) return
    setUpdating(true); setError(null)
    try {
      const res = await fetch('/api/maker/reject-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to reject order')
        setUpdating(false)
      } else {
        router.push('/orders')
      }
    } catch {
      setError('Network error'); setUpdating(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <div className="bg-white px-4 h-14 flex items-center border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-40 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center px-4 h-14 gap-3">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-bold text-gray-900">Order</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Order not found</div>
      </div>
    )
  }

  const shortId = order.id.slice(-6).toUpperCase()
  const nextStep = NEXT_STATUS[order.status]
  const action = ACTION_CONFIG[order.status]
  const banner = STATE_BANNER[order.status]
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status)
  const elapsedFromUpdate = elapsedMins(order.updated_at ?? order.created_at)

  // For pending, elapsed from creation; for others, from last update
  const elapsedDisplay = order.status === 'pending'
    ? elapsedMins(order.created_at)
    : elapsedFromUpdate
  // Suppress tick warning
  void tick

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="text-center">
            <p className="font-black text-gray-900 text-[15px]">Order #{shortId}</p>
            <p className="text-[10px] text-gray-400 -mt-0.5">
              {new Date(order.created_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </p>
          </div>
          {order.payment_method === 'cash' ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
              <Banknote size={10} />Cash
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-full">
              <CreditCard size={10} />Card
            </span>
          )}
        </div>

        {/* ── Status progress strip ──────────────────────────────────────── */}
        <div className="flex items-center px-4 pb-3 gap-0 overflow-x-auto no-scrollbar">
          {STATUS_STEPS.map((step, i) => {
            const isComplete = stepIndex >= i && order.status !== 'cancelled'
            const isCurrent = step.key === order.status
            const isCancelled = order.status === 'cancelled'
            return (
              <div key={step.key} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCancelled && isCurrent ? 'bg-red-100' :
                    isComplete ? 'bg-[#FF6B35]' : 'bg-gray-100'
                  }`}>
                    {isCancelled && isCurrent
                      ? <X size={12} className="text-red-500" />
                      : isComplete
                        ? <CheckCircle size={12} className="text-white" />
                        : <Circle size={12} className="text-gray-300" />
                    }
                  </div>
                  <p className={`text-[9px] font-semibold whitespace-nowrap transition-colors ${
                    isCurrent ? 'text-[#FF6B35]' : isComplete ? 'text-gray-600' : 'text-gray-300'
                  }`}>{step.label}</p>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`h-0.5 w-5 mx-0.5 mb-3.5 rounded-full transition-colors ${
                    stepIndex > i && order.status !== 'cancelled' ? 'bg-[#FF6B35]' : 'bg-gray-100'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </header>

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div className="p-4 space-y-4" style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))' }}>

        {/* ── State banner ──────────────────────────────────────────────── */}
        {banner && (
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${banner.bg}`}>
            <div className="flex-shrink-0 mt-0.5">
              {order.status === 'pending' ? (
                <div className="relative w-3 h-3">
                  <span className={`absolute inset-0 rounded-full ${banner.dot} animate-ping opacity-75`} />
                  <span className={`absolute inset-0 rounded-full ${banner.dot}`} />
                </div>
              ) : (
                <div className={`w-3 h-3 rounded-full ${banner.dot}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{banner.title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Timer size={11} className="text-gray-400" />
                <p className="text-xs text-gray-500">{banner.sub(elapsedDisplay)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}

        {/* ── Items to prepare ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <ChefHat size={16} className="text-[#FF6B35]" />
            <h2 className="font-black text-gray-900 text-sm">
              Items to Prepare
              <span className="ml-2 text-[#FF6B35]">
                ×{order.order_items.reduce((s, oi) => s + oi.quantity, 0)}
              </span>
            </h2>
          </div>
          {order.order_items.map((oi, i) => (
            <div key={i} className="px-4 py-3.5 border-b border-gray-50 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[15px]">
                    <span className="text-[#FF6B35] font-black text-lg mr-1">{oi.quantity}×</span>
                    {oi.menu_item?.name ?? 'Item'}
                  </p>
                  {oi.customization_notes && (
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <AlertCircle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 font-medium bg-amber-50 rounded-lg px-2 py-1">
                        {oi.customization_notes}
                      </p>
                    </div>
                  )}
                </div>
                <span className="font-bold text-gray-900 flex-shrink-0">
                  ${(oi.unit_price * oi.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Delivery address ─────────────────────────────────────────── */}
        {order.delivery_address && (
          <div className="bg-white rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={15} className="text-[#FF6B35]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Delivering to</p>
              <p className="text-sm font-semibold text-gray-800">
                {[order.delivery_address.street, order.delivery_address.city]
                  .filter(Boolean).join(', ') || 'Address on file'}
              </p>
              {order.delivery_address.state && (
                <p className="text-xs text-gray-400">{order.delivery_address.state} {order.delivery_address.zip ?? ''}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Order summary ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package size={14} className="text-gray-400" />
            <h2 className="font-black text-gray-900 text-sm">Order Summary</h2>
          </div>
          <div className="space-y-1.5 text-sm text-gray-500">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>${(order.delivery_fee ?? 0).toFixed(2)}</span>
            </div>
            {order.tip_amount > 0 && (
              <div className="flex justify-between">
                <span>Tip</span>
                <span>${order.tip_amount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between font-black text-gray-900">
            <span>Total</span>
            <span className="text-[#FF6B35] text-lg">${order.total.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Clock size={11} className="text-gray-300" />
            <p className="text-[11px] text-gray-400">
              Your payout: <span className="font-bold text-gray-600">${(order.subtotal * 0.85).toFixed(2)}</span>
            </p>
          </div>
        </div>

      </div>

      {/* ── Action bar — fixed above bottom nav ─────────────────────────── */}
      {(action || rejectConfirm) && (
        <div
          className="fixed left-0 right-0 max-w-[430px] mx-auto px-4 pb-4 space-y-2"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          {/* Reject confirmation modal-row */}
          {rejectConfirm && (
            <div className="bg-white border border-red-200 rounded-2xl p-4 shadow-lg">
              <p className="font-bold text-gray-900 text-sm text-center mb-3">
                Reject this order?{' '}
                {order.payment_method !== 'cash' && (
                  <span className="font-normal text-gray-500">The customer will be refunded.</span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setRejectConfirm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-3 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={updating}
                  className="flex-1 bg-red-500 text-white rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {updating ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  Reject Order
                </button>
              </div>
            </div>
          )}

          {/* Primary action row */}
          {action && !rejectConfirm && (
            <div className="flex gap-2">
              {order.status === 'pending' && (
                <button
                  onClick={() => setRejectConfirm(true)}
                  disabled={updating}
                  className="flex items-center justify-center gap-1.5 bg-white border-2 border-red-200 text-red-500 rounded-2xl px-5 py-4 font-bold text-sm active:bg-red-50 disabled:opacity-50"
                >
                  <X size={17} strokeWidth={3} />
                  Reject
                </button>
              )}
              <button
                onClick={handleAdvance}
                disabled={updating || !nextStep}
                className={`flex-1 ${action.bg} text-white rounded-2xl py-4 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-90 shadow-lg`}
                style={{ boxShadow: order.status === 'pending' ? '0 4px 14px rgba(59,130,246,0.4)' : order.status === 'preparing' ? '0 4px 14px rgba(16,185,129,0.4)' : '0 4px 14px rgba(255,107,53,0.4)' }}
              >
                {updating
                  ? <Loader2 size={18} className="animate-spin" />
                  : action.icon
                }
                {updating ? 'Updating…' : action.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
