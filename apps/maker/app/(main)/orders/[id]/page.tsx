'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@doornext/shared/types'
import {
  ChevronLeft, Check, X, ChefHat, MapPin, Clock,
  CreditCard, Banknote, CheckCircle, Circle, Loader2,
  Timer, Package, AlertCircle, ShieldCheck, Delete, MessageCircle,
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
  { key: 'pending',          label: 'Received'   },
  { key: 'confirmed',        label: 'Accepted'   },
  { key: 'preparing',        label: 'Preparing'  },
  { key: 'ready',            label: 'Ready'      },
  { key: 'arrived_at_maker', label: 'Driver Here' },
  { key: 'picked_up',        label: 'Picked up'  },
  { key: 'delivered',        label: 'Delivered'  },
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
  arrived_at_maker: {
    bg: 'bg-amber-50 border-amber-100',
    dot: 'bg-amber-500',
    title: 'Driver has arrived — enter their PIN to confirm pickup',
    sub: (m) => `Driver waiting ${m} min${m !== 1 ? 's' : ''}`,
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

  // ── PIN confirmation state ──────────────────────────────────────────────────
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', ''])
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinLocked, setPinLocked] = useState(false)
  const [confirmingPin, setConfirmingPin] = useState(false)
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([])

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

  // ── PIN digit input helpers ──────────────────────────────────────────────────
  const handlePinDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pinDigits]
    next[index] = digit
    setPinDigits(next)
    setPinError(null)
    if (digit && index < 3) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus()
    }
  }

  const handleConfirmPickup = async () => {
    if (!order) return
    const pin = pinDigits.join('')
    if (pin.length !== 4) {
      setPinError('Please enter all 4 digits')
      return
    }
    setConfirmingPin(true)
    setPinError(null)
    try {
      const res = await fetch('/api/maker/confirm-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.locked) setPinLocked(true)
        setPinError(data.error ?? 'Confirmation failed')
        setPinDigits(['', '', '', ''])
        pinInputRefs.current[0]?.focus()
      } else {
        setOrder((prev) => prev ? { ...prev, status: 'picked_up', updated_at: new Date().toISOString() } : prev)
        setPinDigits(['', '', '', ''])
      }
    } catch {
      setPinError('Network error — please try again')
    } finally {
      setConfirmingPin(false)
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/messages/order-${order.id}`)}
              className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center"
              title="Message customer"
            >
              <MessageCircle size={18} className="text-[#FF6B35]" />
            </button>
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

        {/* ── PIN entry panel — shown when driver has arrived ─────────── */}
        {order.status === 'arrived_at_maker' && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border-2 border-amber-200">
            {/* Header */}
            <div className="px-4 py-3.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="font-black text-gray-900 text-sm">Confirm Pickup</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Ask the driver for their 4-digit PIN and enter it below</p>
              </div>
            </div>

            <div className="px-4 py-4">
              {/* 4-digit input boxes */}
              <div className="flex gap-3 justify-center mb-4">
                {pinDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { pinInputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinDigit(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    disabled={pinLocked || confirmingPin}
                    className={`w-14 h-16 text-center text-3xl font-black rounded-2xl border-2 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      pinError
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : digit
                        ? 'border-[#FF6B35] bg-orange-50 text-gray-900'
                        : 'border-gray-200 bg-gray-50 text-gray-900 focus:border-[#FF6B35] focus:bg-white'
                    }`}
                  />
                ))}
              </div>

              {/* Numeric keypad */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => {
                  if (key === '') return <div key={i} />
                  return (
                    <button
                      key={i}
                      disabled={pinLocked || confirmingPin}
                      onClick={() => {
                        if (key === '⌫') {
                          // Backspace: clear last filled digit
                          const lastFilled = [...pinDigits].map((d, idx) => d ? idx : -1).filter(idx => idx >= 0).pop() ?? -1
                          if (lastFilled >= 0) {
                            const next = [...pinDigits]
                            next[lastFilled] = ''
                            setPinDigits(next)
                            setPinError(null)
                            pinInputRefs.current[lastFilled]?.focus()
                          }
                        } else {
                          // Fill next empty slot
                          const emptyIdx = pinDigits.findIndex(d => !d)
                          if (emptyIdx >= 0) {
                            handlePinDigit(emptyIdx, key)
                            pinInputRefs.current[emptyIdx]?.focus()
                          }
                        }
                      }}
                      className={`h-12 rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                        key === '⌫'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-gray-50 text-gray-900 active:bg-gray-100'
                      }`}
                    >
                      {key === '⌫' ? <Delete size={18} className="text-gray-500" /> : key}
                    </button>
                  )
                })}
              </div>

              {/* PIN error message */}
              {pinError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600 font-semibold">{pinError}</p>
                </div>
              )}

              {/* Locked state */}
              {pinLocked && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-3 mb-3">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium leading-relaxed">
                    This pickup has been locked after too many failed attempts. Support has been notified and will resolve this shortly.
                  </p>
                </div>
              )}

              {/* Confirm button */}
              {!pinLocked && (
                <button
                  onClick={handleConfirmPickup}
                  disabled={pinDigits.join('').length !== 4 || confirmingPin}
                  className="w-full bg-amber-500 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-2xl py-4 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:shadow-none transition-all active:opacity-90"
                >
                  {confirmingPin
                    ? <><Loader2 size={17} className="animate-spin" />Verifying PIN…</>
                    : <><ShieldCheck size={17} />Confirm Pickup</>
                  }
                </button>
              )}
            </div>
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
