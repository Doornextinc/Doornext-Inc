'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore, useActiveOrderId } from '@/store/driver-store'
import type { OrderStatus } from '@doornext/shared/types'
import {
  MapPin, Phone, CheckCircle, Navigation, Package,
  ChevronDown, ChevronUp, Banknote, ArrowRight, Clock, Star, AlertTriangle, X, MessageCircle,
  ChevronRight, Camera, RotateCcw, MessageSquare, Timer, Route, History, TrendingUp,
} from 'lucide-react'
import { haversineDistance, estimateMinutes, formatEta, arrivalTimeStr, formatDistance } from '@doornext/shared/utils'
import { AppHeader } from '@/components/layout/app-header'
import { playWithHaptic } from '@/lib/notification-sounds'
import type { RouteStop } from '@doornext/shared/stacking'

type TripRecord = {
  id: string
  driver_payout: number
  tip_amount: number
  delivered_at: string | null
  created_at: string
  delivery_address: { street?: string; city?: string; state?: string } | null
  food_maker: { display_name: string } | null
}

type OrderItem = { quantity: number; unit_price: number; menu_items: { name: string } | null }
type ActiveOrder = {
  id: string; status: string; driver_payout: number; tip_amount: number
  payment_method?: 'card' | 'cash'
  pickup_pin: string | null
  pin_attempts: number
  dropoff_note: string | null
  delivery_address: { street?: string; city?: string; state?: string; zip?: string; label?: string; lat?: number; lng?: number } | null
  food_maker: { display_name: string; lat: number; lng: number } | null
  customer: { full_name: string; phone: string | null } | null
  order_items: OrderItem[]
  updated_at: string
  arrived_at_maker_at: string | null
  on_the_way_at: string | null
}

// 6 milestone stages shown in the progress stepper
const STEPS = [
  { status: 'driver_assigned',    label: 'Heading Out',     sublabel: 'Head to kitchen' },
  { status: 'arrived_at_maker',   label: 'At Kitchen',      sublabel: 'Verify & pick up' },
  { status: 'picked_up',          label: 'Picked Up',       sublabel: 'Start delivery' },
  { status: 'on_the_way',         label: 'On the Way',      sublabel: 'Drive to customer' },
  { status: 'arrived_at_customer', label: 'At Customer',    sublabel: 'Complete dropoff' },
  { status: 'delivered',          label: 'Delivered',       sublabel: 'Order complete' },
]

// What action button to show at each status.
// NOTE: 'arrived_at_maker' is intentionally absent — that transition to
// 'picked_up' is triggered by the maker entering the PIN on their device.
const NEXT_ACTION: Record<string, { next: OrderStatus; label: string }> = {
  driver_assigned:     { next: 'arrived_at_maker',   label: 'Arrived at Kitchen' },
  picked_up:           { next: 'on_the_way',         label: 'Start Delivery' },
  on_the_way:          { next: 'arrived_at_customer', label: 'Arrived at Customer' },
  arrived_at_customer: { next: 'delivered',           label: 'Complete Delivery' },
}

// Reasons driver can select when they can't complete delivery
const CANT_DELIVER_REASONS = [
  'Customer not available / no answer at door',
  'Customer refused delivery',
  'Unsafe or inaccessible drop-off location',
  'Incorrect or unverifiable address',
  'Customer requested cancellation at door',
  'Other',
]

// Active statuses to query from DB
const ACTIVE_STATUSES = ['driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer']

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type NavProvider = 'google' | 'apple' | 'waze'

function getNavProvider(): NavProvider {
  if (typeof window === 'undefined') return 'google'
  return (localStorage.getItem('driver_nav_provider') as NavProvider | null) ?? 'google'
}

function buildNavUrl(query: string, lat?: number | null, lng?: number | null): string {
  const provider = getNavProvider()
  const hasCoords = lat != null && lng != null
  switch (provider) {
    case 'apple':
      return hasCoords
        ? `https://maps.apple.com/?daddr=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${encodeURIComponent(query)}`
    case 'waze':
      return hasCoords
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`
    default: // google
      return hasCoords
        ? `https://maps.google.com/?q=${lat},${lng}`
        : `https://maps.google.com/?q=${encodeURIComponent(query)}`
  }
}

function mapsUrl(addr: ActiveOrder['delivery_address']): string {
  if (!addr) return '#'
  const query = `${addr.street}, ${addr.city}, ${addr.state}`
  return buildNavUrl(query, addr.lat, addr.lng)
}

function makerMapsUrl(maker: ActiveOrder['food_maker']): string {
  if (!maker) return '#'
  return buildNavUrl(maker.display_name, maker.lat, maker.lng)
}

// ── SlideToConfirm ──────────────────────────────────────────────────────────
function SlideToConfirm({
  onConfirm,
  label = 'Slide to Complete',
  disabled = false,
}: {
  onConfirm: () => void
  label?: string
  disabled?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)   // 0–1
  const [confirmed, setConfirmed] = useState(false)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const currentProgressRef = useRef(0)

  // Thumb width in px — kept in sync with the CSS (w-14 = 56px)
  const THUMB_W = 56

  const getTrackWidth = () => (trackRef.current?.clientWidth ?? 300) - THUMB_W

  const clamp = (v: number) => Math.max(0, Math.min(1, v))

  const springBack = () => {
    // Animate back to 0 via CSS transition — just reset state
    setProgress(0)
    currentProgressRef.current = 0
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || confirmed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    startXRef.current = e.clientX - currentProgressRef.current * getTrackWidth()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const raw = (e.clientX - startXRef.current) / getTrackWidth()
    const clamped = clamp(raw)
    currentProgressRef.current = clamped
    setProgress(clamped)
  }

  const handlePointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false

    if (currentProgressRef.current > 0.8) {
      setConfirmed(true)
      setProgress(1)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100])
      }
      onConfirm()
    } else {
      springBack()
    }
  }

  const thumbLeft = progress * (trackRef.current ? trackRef.current.clientWidth - THUMB_W : 0)
  const labelOpacity = 1 - progress * 2   // fades out by 50% progress

  return (
    <div
      ref={trackRef}
      className={`relative w-full h-14 bg-[#1A1A1A] rounded-full overflow-hidden select-none ${disabled ? 'opacity-50' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Filled track behind thumb */}
      <div
        className="absolute inset-y-0 left-0 bg-green-500/20 rounded-full"
        style={{ width: thumbLeft + THUMB_W }}
      />

      {/* Label text */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: Math.max(0, labelOpacity) }}
      >
        <span className="text-sm font-black text-zinc-400 tracking-wide">{confirmed ? 'Confirmed!' : label}</span>
      </div>

      {/* Thumb */}
      <div
        className={`absolute top-1 bottom-1 w-12 rounded-full flex items-center justify-center gap-0.5 shadow-lg ${
          confirmed ? 'bg-green-400' : 'bg-green-500'
        }`}
        style={{
          left: thumbLeft + 4,
          transition: draggingRef.current ? 'none' : 'left 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {confirmed ? (
          <CheckCircle size={22} className="text-white" />
        ) : (
          <>
            <ChevronRight size={16} className="text-white opacity-80 -mr-1" />
            <ChevronRight size={16} className="text-white" />
          </>
        )}
      </div>
    </div>
  )
}

// ── DeliveryCompletionCelebration ────────────────────────────────────────────
function DeliveryCompletionCelebration({
  earn,
  tip,
  onContinue,
}: {
  earn: number
  tip: number
  onContinue: () => void
}) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(8)
  const [checkVisible, setCheckVisible] = useState(false)

  useEffect(() => {
    // Trigger check animation after a brief paint delay
    const t = setTimeout(() => setCheckVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (countdown <= 0) {
      router.push('/')
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, router])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
      style={{
        background: 'radial-gradient(ellipse at 50% 45%, rgba(34,197,94,0.08) 0%, rgba(255,122,80,0.05) 40%, #080808 70%)',
        backgroundColor: '#080808',
      }}
    >
      {/* Animated checkmark */}
      <div
        className="w-28 h-28 rounded-full border-2 border-green-500/40 bg-green-500/10 flex items-center justify-center mb-6"
        style={{
          transform: checkVisible ? 'scale(1)' : 'scale(0)',
          transition: 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <CheckCircle size={56} className="text-green-400" />
      </div>

      {/* Heading */}
      <h1 className="text-4xl font-black text-white mb-1">Delivered! 🎉</h1>
      <p className="text-zinc-500 text-sm mb-8">Great work — you nailed it.</p>

      {/* Earnings card */}
      <div className="w-full max-w-xs bg-[#141414] rounded-3xl border border-white/5 px-8 py-6 mb-6 shadow-xl">
        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-2">You earned</p>
        <p
          className="text-5xl font-black mb-1"
          style={{ color: '#FF7A50' }}
        >
          ${earn.toFixed(2)}
        </p>
        {tip > 0 && (
          <p className="text-sm font-bold text-green-400 mt-1">+ ${tip.toFixed(2)} tip included</p>
        )}
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="w-full max-w-xs bg-[#FF7A50] text-white rounded-2xl py-4 font-black text-base shadow-lg shadow-[#FF7A50]/25 active:scale-[0.98] transition-all mb-4"
      >
        Continue Earning
      </button>

      {/* Countdown */}
      <p className="text-xs text-zinc-700">
        Returning to dashboard in {countdown}s…
      </p>
    </div>
  )
}

// ── RoutePlanPanel ─────────────────────────────────────────────────────────────
function RoutePlanPanel({ stops }: { stops: RouteStop[] }) {
  const pending = stops.filter(s => !s.done)
  const done    = stops.filter(s => s.done)
  const next    = pending[0] ?? null

  return (
    <div className="bg-[#111]/95 border border-white/8 rounded-2xl overflow-hidden mx-4 mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/6">
        <Route size={14} className="text-[#FF7A50]" />
        <span className="text-xs font-black text-[#FF7A50] uppercase tracking-wider">Multi-Order Route</span>
        <span className="ml-auto text-xs text-zinc-500 font-semibold">{done.length}/{stops.length} done</span>
      </div>
      <div className="px-4 py-2 space-y-2">
        {stops.map((stop, idx) => {
          const isNext = !stop.done && pending[0]?.seq === stop.seq
          return (
            <div key={`${stop.order_id}-${stop.type}`} className="flex items-center gap-3">
              {/* Sequence indicator */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black ${
                stop.done  ? 'bg-green-500/20 text-green-400' :
                isNext     ? 'bg-[#FF7A50] text-white' :
                             'bg-white/8 text-zinc-500'
              }`}>
                {stop.done ? '✓' : stop.seq}
              </div>
              {/* Stop info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${stop.done ? 'text-zinc-600 line-through' : isNext ? 'text-white' : 'text-zinc-400'}`}>
                  {stop.label}
                </p>
                <p className={`text-[10px] uppercase tracking-wide font-black ${
                  stop.type === 'pickup' ? 'text-amber-500' : 'text-blue-400'
                }`}>
                  {stop.type === 'pickup' ? '▲ Pick up' : '● Drop off'}
                </p>
              </div>
              {isNext && (
                <span className="text-[10px] font-black text-[#FF7A50] bg-[#FF7A50]/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  NEXT
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TripsHistoryPanel ────────────────────────────────────────────────────────
function TripsHistoryPanel({
  userId,
  trips,
  loading,
  loaded,
  onTripsLoaded,
}: {
  userId: string | null
  trips: TripRecord[]
  loading: boolean
  loaded: boolean
  onTripsLoaded: (data: TripRecord[]) => void
}) {
  useEffect(() => {
    if (loaded || !userId) return
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, driver_payout, tip_amount, delivered_at, created_at, delivery_address, food_maker:food_makers(display_name)')
          .eq('nexter_id', userId)
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false })
          .limit(50)
        onTripsLoaded((data as unknown as TripRecord[]) ?? [])
      } catch { /* silently ignore */ }
    })()
  }, [loaded, userId, onTripsLoaded])

  if (loading || !loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-[#FF7A50] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (trips.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
        <div className="relative mb-6">
          <span
            className="absolute inset-0 -m-4 rounded-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle at center, rgba(255,122,80,0.12), transparent 70%)' }}
          />
          <div className="relative w-20 h-20 rounded-3xl bg-[#141414] border border-white/8 flex items-center justify-center">
            <Package size={32} className="text-zinc-700" />
          </div>
        </div>
        <p className="text-xl font-black text-white mb-2 tracking-tight">No completed trips yet</p>
        <p className="text-zinc-500 text-sm max-w-[260px]">
          Once you finish a delivery, it'll show up here with your earnings and rating.
        </p>
      </div>
    )
  }

  // ── Summary stats: lifetime + last 7 days ─────────────────────────────────
  const totalEarned = trips.reduce((s, t) => s + (t.driver_payout ?? 0), 0)
  const totalTips   = trips.reduce((s, t) => s + (t.tip_amount ?? 0), 0)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const last7Trips = trips.filter((t) => {
    const ts = new Date(t.delivered_at ?? t.created_at).getTime()
    return ts >= sevenDaysAgo
  })
  const last7Earned = last7Trips.reduce((s, t) => s + (t.driver_payout ?? 0), 0)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero summary — corporate-grade focal point */}
      <div className="relative px-4 pt-4 pb-3 bg-gradient-to-b from-[#101010] to-[#0A0A0A] border-b border-white/5 overflow-hidden">
        <span
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,122,80,0.08), transparent 70%)' }}
        />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Lifetime Earnings</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-black text-white tracking-tight">${totalEarned.toFixed(2)}</p>
            {totalTips > 0 && (
              <p className="text-sm font-bold text-green-400">+${totalTips.toFixed(2)} tips</p>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A50]" />
              <span className="text-zinc-400 font-semibold">{trips.length} trip{trips.length === 1 ? '' : 's'}</span>
            </div>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400 font-semibold">
              ${(totalEarned / trips.length).toFixed(2)} avg
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400 font-semibold">
              ${last7Earned.toFixed(0)} <span className="text-zinc-600 font-normal">past 7d</span>
            </span>
          </div>
        </div>
      </div>

      {/* Trip list */}
      <div className="divide-y divide-white/5">
        {trips.map((trip) => {
          const maker = Array.isArray(trip.food_maker) ? trip.food_maker[0] : trip.food_maker
          const addr = trip.delivery_address
          const deliveredAt = trip.delivered_at ?? trip.created_at
          const date = new Date(deliveredAt)
          const isToday = new Date().toDateString() === date.toDateString()
          const dateStr = isToday
            ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

          const subtotalEarn = (trip.driver_payout ?? 0) + (trip.tip_amount ?? 0)

          return (
            <div key={trip.id} className="flex items-start gap-3 px-4 py-3.5 active:bg-white/[0.02] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#FF7A50]/10 border border-[#FF7A50]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Package size={16} className="text-[#FF7A50]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">
                  {maker?.display_name ?? 'Unknown restaurant'}
                </p>
                {addr && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-zinc-700 text-[11px]">→</span>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {[addr.street, addr.city].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-zinc-700 mt-0.5">{dateStr}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-[#FF7A50]">+${subtotalEarn.toFixed(2)}</p>
                {(trip.tip_amount ?? 0) > 0 && (
                  <p className="text-[10px] text-green-500 font-semibold mt-0.5">
                    inc ${trip.tip_amount.toFixed(2)} tip
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="h-6" />
    </div>
  )
}

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { setActiveOrder, setActiveOrders, removeActiveOrder, setLocation } = useDriverStore()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const storeActiveOrderId = useActiveOrderId()
  const storeActiveOrderIds = useDriverStore((s) => s.activeOrderIds)
  const driverLat = useDriverStore((s) => s.currentLat)
  const driverLng = useDriverStore((s) => s.currentLng)
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  // Multi-order stacking support
  const [allOrders, setAllOrders] = useState<ActiveOrder[]>([])
  const [routePlan, setRoutePlan] = useState<RouteStop[] | null>(null)
  const [isStacked, setIsStacked] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 6
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showItems, setShowItems] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const [delivered, setDelivered] = useState(false)
  const [deliveredOrder, setDeliveredOrder] = useState<ActiveOrder | null>(null)
  const [showCantDeliver, setShowCantDeliver] = useState(false)
  const [cantDeliverReason, setCantDeliverReason] = useState<string | null>(null)
  const [submittingFailed, setSubmittingFailed] = useState(false)
  const [failedError, setFailedError] = useState<string | null>(null)
  // Trips tab
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active')
  const [trips, setTrips] = useState<TripRecord[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsLoaded, setTripsLoaded] = useState(false)
  // Proof photo state
  const [proofPhoto, setProofPhoto] = useState<File | null>(null)
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null)
  const [proofUploadError, setProofUploadError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownWarnedRef = useRef(false)

  const broadcastLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !userId) return
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setLocation(lat, lng)
        const supabase = createClient()
        await supabase.from('nexter_locations').upsert(
          { nexter_id: userId, lat, lng, updated_at: new Date().toISOString() },
          { onConflict: 'nexter_id' }
        )
      },
      () => { /* location unavailable — silently skip this tick */ },
      { timeout: 5000, maximumAge: 15000 }
    )
  }, [setLocation, userId])

  const loadActiveOrder = useCallback(async () => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    try {
      const res = await fetch('/api/driver/active-order')
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) {
        setLoading(false)
        return
      }
      const json = await res.json()

      // New multi-order API shape: { orders, routePlan, isStacked, order (compat) }
      const orders: ActiveOrder[] = json.orders ?? (json.order ? [json.order] : [])
      const plan: RouteStop[] | null = json.routePlan ?? null
      const stacked = json.isStacked ?? false

      if (orders.length > 0) {
        setAllOrders(orders)
        setRoutePlan(plan)
        setIsStacked(stacked)
        setActiveOrders(orders.map(o => o.id))

        // Keep selectedOrderId pointing to a valid order
        setSelectedOrderId(prev => {
          if (prev && orders.find(o => o.id === prev)) return prev
          return orders[0].id
        })
        // Set primary display order
        setOrder(orders[0])
        setActiveOrder(orders[0].id)
      } else {
        setAllOrders([])
        setOrder(null)
        setRoutePlan(null)
        setIsStacked(false)
        setActiveOrder(null)
      }
    } catch {
      // Network error — keep current state
    } finally {
      setLoading(false)
    }
  }, [router, setActiveOrder, setActiveOrders, userId, authReady, hasHydrated])

  useEffect(() => { loadActiveOrder() }, [loadActiveOrder])

  // Retry if we expect an order (activeOrderId in store) but none came back yet —
  // handles the race where accept-order returns before the DB write is visible.
  useEffect(() => {
    if (!loading && !order && storeActiveOrderId && retryCount < MAX_RETRIES) {
      const t = setTimeout(() => {
        setLoading(true)
        setRetryCount(c => c + 1)
        loadActiveOrder()
      }, 500)
      return () => clearTimeout(t)
    }
  }, [loading, order, storeActiveOrderId, retryCount, loadActiveOrder])

  // Sync selected order display whenever selectedOrderId changes
  useEffect(() => {
    if (!selectedOrderId) return
    const sel = allOrders.find(o => o.id === selectedOrderId)
    if (sel) setOrder(sel)
  }, [selectedOrderId, allOrders])

  // Real-time: detect when maker confirms pickup PIN (status → picked_up)
  // or any other external order status change. Subscribe to ALL stacked orders.
  useEffect(() => {
    if (allOrders.length === 0) return
    const supabase = createClient()
    const channels = allOrders.map(o =>
      supabase
        .channel(`driver-order-${o.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` },
          (payload) => {
            const newStatus = payload.new.status as string
            setAllOrders(prev => prev.map(ord =>
              ord.id === o.id
                ? { ...ord, status: newStatus, updated_at: payload.new.updated_at ?? ord.updated_at }
                : ord
            ))
            if (newStatus === 'picked_up') playWithHaptic('order_ready')
            // Re-fetch full stack in background
            fetch('/api/driver/active-order')
              .then(r => r.ok ? r.json() : null)
              .then(json => {
                if (!json) return
                const updatedOrders: ActiveOrder[] = json.orders ?? (json.order ? [json.order] : [])
                if (updatedOrders.length > 0) {
                  setAllOrders(updatedOrders)
                  setRoutePlan(json.routePlan ?? null)
                }
              })
              .catch(() => {})
          }
        )
        .subscribe()
    )
    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [allOrders.map(o => o.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!order) return
    broadcastLocation()
    locationIntervalRef.current = setInterval(broadcastLocation, 10_000)
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current) }
  }, [order, broadcastLocation])

  useEffect(() => {
    if (!order) return
    const start = new Date(order.updated_at).getTime()
    // Reset timer only when the status changes, not on every order object update
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [order?.id, order?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (proofPhotoUrl) URL.revokeObjectURL(proofPhotoUrl)
    }
  }, [proofPhotoUrl])

  // ── Delivery countdown anchor ─────────────────────────────────────────────
  // Computed once when on_the_way_at is stamped. Uses straight-line distance
  // maker → customer as the baseline ETA (same formula as the ETA strip).
  const estimatedArrivalAt = useMemo(() => {
    if (!order?.on_the_way_at) return null
    const mLat = order.food_maker?.lat
    const mLng = order.food_maker?.lng
    const cLat = order.delivery_address?.lat
    const cLng = order.delivery_address?.lng
    if (!mLat || !mLng || !cLat || !cLng) return null
    const distKm = haversineDistance(mLat, mLng, cLat, cLng)
    // Add 40% buffer over straight-line estimate so drivers aren't penalised
    // for normal traffic/routing overhead
    return new Date(order.on_the_way_at).getTime() + estimateMinutes(distKm) * 1.4 * 60_000
  }, [
    order?.on_the_way_at,
    order?.food_maker?.lat, order?.food_maker?.lng,
    order?.delivery_address?.lat, order?.delivery_address?.lng,
  ])

  // Haptic + visual warning when ≤ 5 minutes remain
  useEffect(() => {
    if (estimatedArrivalAt == null) { countdownWarnedRef.current = false; return }
    const secs = Math.max(0, Math.round((estimatedArrivalAt - Date.now()) / 1000))
    if (secs <= 300 && secs > 0 && !countdownWarnedRef.current) {
      countdownWarnedRef.current = true
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200])
      }
    }
  }, [estimatedArrivalAt, elapsed])

  // Load trip history when the History tab is shown
  useEffect(() => {
    if (activeTab !== 'history' || tripsLoaded || !userId) return
    setTripsLoading(true)
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, driver_payout, tip_amount, delivered_at, created_at, delivery_address, food_maker:food_makers(display_name)')
          .eq('nexter_id', userId)
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false })
          .limit(50)
        setTrips((data as unknown as TripRecord[]) ?? [])
        setTripsLoaded(true)
      } catch { /* silently ignore — trips just won't show */ } finally {
        setTripsLoading(false)
      }
    })()
  }, [activeTab, tripsLoaded, userId])

  const handleProofPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (proofPhotoUrl) URL.revokeObjectURL(proofPhotoUrl)
    setProofPhoto(file)
    setProofPhotoUrl(URL.createObjectURL(file))
  }

  const handleCantDeliver = async () => {
    if (!order || !cantDeliverReason) return
    setSubmittingFailed(true)
    setFailedError(null)
    try {
      const res = await fetch('/api/driver/failed-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: cantDeliverReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFailedError(data.error ?? 'Failed to report. Please try again.')
        setSubmittingFailed(false)
        return
      }
      setActiveOrder(null)
      setShowCantDeliver(false)
      // Navigate home with a brief delay
      setTimeout(() => router.push('/'), 500)
    } catch {
      setFailedError('Network error. Please try again.')
    }
    setSubmittingFailed(false)
  }

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (!order) return
    // Require item verification before confirming pickup
    if (order.status === 'arrived_at_maker' && order.order_items.length > 0 && checkedItems.size < order.order_items.length) {
      const ok = window.confirm(`You haven't verified all ${order.order_items.length} items. Continue anyway?`)
      if (!ok) return
    }
    setUpdating(true)
    setUpdateError(null)

    try {
      // If completing delivery and a proof photo was captured, upload it first (non-fatal)
      if (newStatus === 'delivered' && proofPhoto) {
        try {
          const form = new FormData()
          form.append('orderId', order.id)
          form.append('file', proofPhoto)
          const uploadRes = await fetch('/api/driver/upload-proof', { method: 'POST', body: form })
          if (!uploadRes.ok) setProofUploadError(true)
        } catch (err) {
          console.error('Proof photo upload failed (non-fatal):', err)
          setProofUploadError(true)
        }
      }

      const res = await fetch('/api/driver/update-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUpdateError(data.error ?? 'Failed to update status. Please try again.')
        setUpdating(false)
        return
      }

      if (newStatus === 'delivered') {
        playWithHaptic('delivery_done')
        setDeliveredOrder(order)
        // Remove this order from the active stack
        removeActiveOrder(order.id)
        const remaining = allOrders.filter(o => o.id !== order.id)
        setAllOrders(remaining)
        if (remaining.length === 0) {
          // Last order in stack delivered — show celebration
          setActiveOrder(null)
          setDelivered(true)
        } else {
          // Still have orders to deliver — switch to next order
          setSelectedOrderId(remaining[0].id)
          setOrder(remaining[0])
          setIsStacked(remaining.length > 1)
        }
      } else {
        const updated = { ...order, status: newStatus }
        setOrder(updated)
        setAllOrders(prev => prev.map(o => o.id === order.id ? updated : o))
        setCheckedItems(new Set())
      }
    } catch {
      setUpdateError('Network error. Please check your connection and try again.')
    }
    setUpdating(false)
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Trips" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-[3px] border-[#FF7A50] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  /* ── Delivery success celebration ── */
  if (delivered) {
    const earn = deliveredOrder?.driver_payout ?? 0
    const tip = deliveredOrder?.tip_amount ?? 0
    return (
      <DeliveryCompletionCelebration
        earn={earn}
        tip={tip}
        onContinue={() => router.push('/')}
      />
    )
  }

  /* ── Loading: we have a store-known active order but server hasn't returned yet ── */
  if (!order && storeActiveOrderId && retryCount < MAX_RETRIES) {
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <AppHeader title="Trips" />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-12 h-12 border-[3px] border-[#FF7A50]/30 border-t-[#FF7A50] rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-white">Loading your delivery…</p>
          <p className="text-xs text-zinc-500 mt-1">Hang tight — fetching the latest details</p>
        </div>
      </div>
    )
  }

  if (!order) {
    // No active delivery — show the Trips page with History tab selected
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <AppHeader title="Trips" />
        <TripsHistoryPanel
          userId={userId}
          trips={trips}
          loading={tripsLoading}
          loaded={tripsLoaded}
          onTripsLoaded={(data) => { setTrips(data); setTripsLoaded(true) }}
        />
      </div>
    )
  }

  const nextAction = NEXT_ACTION[order.status]
  const addr = order.delivery_address
  const currentStepIdx = STEPS.findIndex(s => s.status === order.status)
  const earn = order.driver_payout ?? 0

  const isHeadingToMaker    = order.status === 'driver_assigned'
  const isAtMaker           = order.status === 'arrived_at_maker'
  const isPickedUp          = order.status === 'picked_up'
  const isHeadingToCustomer = order.status === 'on_the_way'
  const isAtCustomer        = order.status === 'arrived_at_customer'

  const isPickupPhase = isHeadingToMaker || isAtMaker || isPickedUp
  const isDropoffPhase = isHeadingToCustomer || isAtCustomer

  // Proof photo is required for contactless / leave-at-door drop-offs
  const LEAVE_AT_DOOR_KEYWORDS = ['leave at door', 'leave at the door', 'contactless', 'no contact', 'door step', 'doorstep', 'leave outside', 'leave by the door']
  const requiresProof = isAtCustomer && !!order.dropoff_note &&
    LEAVE_AT_DOOR_KEYWORDS.some(kw => order.dropoff_note!.toLowerCase().includes(kw))

  // ── ETA calculations (updates every 10 s via broadcastLocation → store) ──
  const makerLat = order.food_maker?.lat
  const makerLng = order.food_maker?.lng
  const custLat  = addr?.lat
  const custLng  = addr?.lng

  const toMakerKm = (driverLat && driverLng && makerLat && makerLng)
    ? haversineDistance(driverLat, driverLng, makerLat, makerLng) : null
  const toCustomerKm = (driverLat && driverLng && custLat && custLng)
    ? haversineDistance(driverLat, driverLng, custLat, custLng) : null
  // Fallback: restaurant → customer for when we have no live driver location yet
  const makerToCustomerKm = (makerLat && makerLng && custLat && custLng)
    ? haversineDistance(makerLat, makerLng, custLat, custLng) : null

  const pickupEtaMins   = toMakerKm   != null ? estimateMinutes(toMakerKm)   : null
  const dropoffEtaMins  = toCustomerKm != null ? estimateMinutes(toCustomerKm)
                        : makerToCustomerKm   != null ? estimateMinutes(makerToCustomerKm) : null

  // Aggregate earnings across all stacked orders for the header strip
  const totalEarn = allOrders.reduce((s, o) => s + (o.driver_payout ?? 0), 0)
  const totalTip  = allOrders.reduce((s, o) => s + (o.tip_amount ?? 0), 0)

  // Countdown — re-derives on every elapsed tick (1 s interval)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void elapsed  // ensure re-render every second
  const remainingSecs = estimatedArrivalAt != null
    ? Math.max(0, Math.round((estimatedArrivalAt - Date.now()) / 1000))
    : null
  const isCountdownUrgent = remainingSecs != null && remainingSecs < 300

  return (
    <div className="flex flex-col min-h-full pb-[144px]">
      <AppHeader title="Trips" />

      {/* ── Active / History tab strip — corporate underline style ── */}
      <div className="flex gap-1 px-4 pt-2 bg-[#080808] border-b border-white/5">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 relative flex items-center justify-center gap-1.5 py-3 text-xs font-black transition-colors ${
            activeTab === 'active' ? 'text-white' : 'text-zinc-500 active:text-zinc-300'
          }`}
        >
          <Package size={13} className={activeTab === 'active' ? 'text-[#FF7A50]' : 'text-zinc-600'} />
          <span className="uppercase tracking-wider">Active</span>
          {activeTab === 'active' && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#FF7A50] rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 relative flex items-center justify-center gap-1.5 py-3 text-xs font-black transition-colors ${
            activeTab === 'history' ? 'text-white' : 'text-zinc-500 active:text-zinc-300'
          }`}
        >
          <History size={13} className={activeTab === 'history' ? 'text-[#FF7A50]' : 'text-zinc-600'} />
          <span className="uppercase tracking-wider">History</span>
          {activeTab === 'history' && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#FF7A50] rounded-full" />
          )}
        </button>
      </div>

      {/* ── History tab ── */}
      {activeTab === 'history' && (
        <TripsHistoryPanel
          userId={userId}
          trips={trips}
          loading={tripsLoading}
          loaded={tripsLoaded}
          onTripsLoaded={(data) => { setTrips(data); setTripsLoaded(true) }}
        />
      )}

      {/* ── Active delivery content ── */}
      {activeTab === 'active' && <>

      {/* ── Order switcher tabs — stacked mode only ── */}
      {isStacked && allOrders.length > 1 && (
        <div className="flex gap-2 px-4 py-2 bg-[#0D0D0D] border-b border-white/5 overflow-x-auto">
          {allOrders.map((o, idx) => (
            <button
              key={o.id}
              onClick={() => setSelectedOrderId(o.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                selectedOrderId === o.id
                  ? 'bg-[#FF7A50] text-white'
                  : 'bg-white/6 text-zinc-400'
              }`}
            >
              <span>Order {idx + 1}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                ['driver_assigned', 'arrived_at_maker'].includes(o.status)
                  ? 'bg-amber-400'
                  : ['picked_up', 'on_the_way', 'arrived_at_customer'].includes(o.status)
                  ? 'bg-blue-400'
                  : 'bg-green-400'
              }`} />
            </button>
          ))}
        </div>
      )}

      {/* ── Route plan strip — stacked mode only ── */}
      {isStacked && routePlan && routePlan.length > 0 && (
        <div className="pt-3">
          <RoutePlanPanel stops={routePlan} />
        </div>
      )}

      {/* Cash banner */}
      {order.payment_method === 'cash' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/12 border-b border-green-500/20">
          <Banknote size={15} className="text-green-400 flex-shrink-0" />
          <p className="text-sm font-bold text-green-400">Cash order — collect payment at drop-off</p>
        </div>
      )}

      {/* Top bar: timer + earnings */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0A0A0A]">
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-zinc-600" />
          <span className="font-mono text-sm font-bold text-white">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{isStacked ? 'Total earn' : 'You earn'}</span>
          <span className="font-black text-[#FF7A50] text-sm">${(isStacked ? totalEarn : earn).toFixed(2)}</span>
          {(isStacked ? totalTip : order.tip_amount) > 0 && (
            <span className="text-xs text-green-400 font-semibold ml-1">+${(isStacked ? totalTip : order.tip_amount).toFixed(2)} tip</span>
          )}
        </div>
      </div>

      {/* ── Progress stepper (6 milestones) ── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const done = i < currentStepIdx
            const active = i === currentStepIdx
            const upcoming = i > currentStepIdx
            return (
              <div key={step.status} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-colors ${done || active ? 'bg-[#FF7A50]' : 'bg-[#1A1A1A]'}`} />
                  )}
                  <div className={`relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    done ? 'bg-[#FF7A50]' : active ? 'bg-[#FF7A50] ring-4 ring-[#FF7A50]/25' : 'bg-[#1A1A1A]'
                  }`}>
                    {done
                      ? <CheckCircle size={13} className="text-white" />
                      : <span className={`text-[10px] font-black ${upcoming ? 'text-zinc-600' : 'text-white'}`}>{i + 1}</span>
                    }
                    {active && <span className="absolute inset-0 rounded-full animate-ping bg-[#FF7A50]/25" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-colors ${done ? 'bg-[#FF7A50]' : 'bg-[#1A1A1A]'}`} />
                  )}
                </div>
                <div className="mt-2 text-center px-0.5">
                  <p className={`text-[9px] font-bold leading-tight ${active ? 'text-[#FF7A50]' : done ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {step.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Stage: Heading to Restaurant ── */}
      {isHeadingToMaker && (
        <>
          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Pickup at</p>
              <p className="text-xl font-black text-white">{order.food_maker?.display_name}</p>
              <p className="text-sm text-zinc-500 mt-0.5">Order #{order.id.slice(-6).toUpperCase()}</p>
            </div>
            <a
              href={makerMapsUrl(order.food_maker)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#FF7A50] py-3.5 text-sm font-black text-white"
            >
              <Navigation size={16} />
              Navigate to Restaurant
              <ArrowRight size={14} className="opacity-70" />
            </a>
          </div>

          {/* ETA strip */}
          {pickupEtaMins != null && (
            <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-[#FF7A50] text-lg leading-none">{formatEta(pickupEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">To Pickup</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-white text-lg leading-none">
                  {toMakerKm != null ? formatDistance(toMakerKm) : '—'}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Distance</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-zinc-300 text-lg leading-none">{arrivalTimeStr(pickupEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Arrives by</p>
              </div>
            </div>
          )}

          {addr && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3.5">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Delivering to</p>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-zinc-300">{addr.street}</p>
                  <p className="text-xs text-zinc-500">{addr.city}, {addr.state} {addr.zip}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Stage: Arrived at Restaurant — PIN handoff ── */}
      {isAtMaker && (
        <>
          {/* PIN display card — driver shows this to the maker */}
          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-[#FF7A50]/30 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF7A50] animate-pulse" />
              <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider">Your Pickup PIN</p>
            </div>
            <div className="px-4 pb-4">
              <div className="flex items-center gap-3 mt-1">
                {(order.pickup_pin ?? '----').split('').map((digit, i) => (
                  <div
                    key={i}
                    className="w-14 h-16 rounded-xl bg-[#0A0A0A] border-2 border-[#FF7A50]/40 flex items-center justify-center"
                  >
                    <span className="text-3xl font-black text-white tracking-widest">{digit}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
                Read this code to the maker — they must enter it on their screen to confirm the pickup handoff.
              </p>
            </div>
          </div>

          {/* Waiting state + elapsed timer */}
          <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-300">Waiting for maker to confirm</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Your screen will update automatically once they enter the PIN</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Timer size={11} className="text-amber-400" />
              <span className="text-amber-300 font-black text-sm tabular-nums">{formatElapsed(elapsed)}</span>
            </div>
          </div>

          {/* Item checklist — informational only while waiting */}
          {order.order_items.length > 0 && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setShowItems(!showItems)}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Package size={15} className="text-[#FF7A50]" />
                  <span className="text-sm font-bold text-white">Check Items</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    checkedItems.size === order.order_items.length
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[#1A1A1A] text-zinc-500'
                  }`}>
                    {checkedItems.size}/{order.order_items.length}
                  </span>
                </div>
                {showItems ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
              </button>
              {showItems && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {order.order_items.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => setCheckedItems(prev => {
                        const next = new Set(prev)
                        next.has(i) ? next.delete(i) : next.add(i)
                        return next
                      })}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5"
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                        checkedItems.has(i) ? 'bg-green-500 border-green-500' : 'border-zinc-700'
                      }`}>
                        {checkedItems.has(i) && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm flex-1 ${checkedItems.has(i) ? 'text-zinc-600 line-through' : 'text-white'}`}>
                        {item.quantity}× {item.menu_items?.name ?? 'Item'}
                      </span>
                      <span className="text-xs text-zinc-600">${(item.quantity * item.unit_price).toFixed(2)}</span>
                    </button>
                  ))}
                  {checkedItems.size === order.order_items.length && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10">
                      <CheckCircle size={13} className="text-green-400" />
                      <span className="text-xs font-bold text-green-400">All items verified!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Stage: Picked Up — Start Delivery ── */}
      {isPickedUp && (
        <>
          <div className="mx-4 mb-3 bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-green-300">Order picked up from {order.food_maker?.display_name}</p>
                <p className="text-xs text-green-400/70 mt-0.5">Now head to the customer</p>
              </div>
            </div>
          </div>

          {/* ETA to customer */}
          {dropoffEtaMins != null && (
            <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-[#FF7A50] text-lg leading-none">{formatEta(dropoffEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">To Customer</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-white text-lg leading-none">
                  {toCustomerKm != null ? formatDistance(toCustomerKm) : makerToCustomerKm != null ? formatDistance(makerToCustomerKm) : '—'}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Distance</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-zinc-300 text-lg leading-none">{arrivalTimeStr(dropoffEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Arrives by</p>
              </div>
            </div>
          )}

          {order.dropoff_note && (
            <div className="mx-4 mb-3 bg-[#FF7A50]/10 border border-[#FF7A50]/30 rounded-2xl px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <MessageSquare size={15} className="text-[#FF7A50] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Drop-off Instructions</p>
                  <p className="text-sm text-zinc-200 leading-relaxed">{order.dropoff_note}</p>
                </div>
              </div>
            </div>
          )}

          {addr && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Delivering to</p>
                <p className="text-xl font-black text-white leading-tight">{addr.street}</p>
                <p className="text-sm text-zinc-400 mt-0.5">{addr.city}, {addr.state} {addr.zip}</p>
              </div>
              <a
                href={mapsUrl(addr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#FF7A50] py-3.5 text-sm font-black text-white"
              >
                <Navigation size={16} />
                Navigate to Customer
                <ArrowRight size={14} className="opacity-70" />
              </a>
            </div>
          )}
        </>
      )}

      {/* ── Stage: On the Way to Customer ── */}
      {isHeadingToCustomer && (
        <>
          {/* Delivery countdown + urgency warning */}
          {remainingSecs != null && (
            <div className={`mx-4 mb-3 rounded-2xl border px-4 py-3.5 flex items-center gap-3 ${
              isCountdownUrgent
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-[#FF7A50]/8 border-[#FF7A50]/20'
            }`}>
              <Timer size={20} className={`flex-shrink-0 ${isCountdownUrgent ? 'text-red-400' : 'text-[#FF7A50]'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${
                  isCountdownUrgent ? 'text-red-400' : 'text-zinc-500'
                }`}>
                  {isCountdownUrgent ? '⚠ Almost out of time' : 'Time to deliver'}
                </p>
                <p className={`font-black text-3xl tabular-nums leading-none ${
                  isCountdownUrgent ? 'text-red-300' : 'text-white'
                }`}>
                  {remainingSecs > 0 ? formatCountdown(remainingSecs) : (
                    <span className="text-red-400">Overdue</span>
                  )}
                </p>
                {isCountdownUrgent && (
                  <p className="text-xs text-red-400/80 mt-1 font-semibold">
                    Drive fast — customer is waiting
                  </p>
                )}
              </div>
              {isCountdownUrgent && remainingSecs > 0 && (
                <div className="w-3 h-3 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
              )}
            </div>
          )}

          {/* Live ETA strip — updates every 10 s via driver GPS */}
          {dropoffEtaMins != null && (
            <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
              <div className="bg-[#141414] border border-[#FF7A50]/20 rounded-2xl py-3 text-center">
                <p className="font-black text-[#FF7A50] text-lg leading-none">{formatEta(dropoffEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">ETA</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-white text-lg leading-none">
                  {toCustomerKm != null ? formatDistance(toCustomerKm) : '—'}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Remaining</p>
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl py-3 text-center">
                <p className="font-black text-zinc-300 text-lg leading-none">{arrivalTimeStr(dropoffEtaMins)}</p>
                <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Arrives by</p>
              </div>
            </div>
          )}

          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Delivering to</p>
              {addr ? (
                <>
                  <p className="text-xl font-black text-white leading-tight">{addr.street}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{addr.city}, {addr.state} {addr.zip}</p>
                  {addr.label && <p className="text-xs text-zinc-500 mt-1 italic">{addr.label}</p>}
                </>
              ) : (
                <p className="text-zinc-500">Address not available</p>
              )}
            </div>
            {addr && (
              <a
                href={mapsUrl(addr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#FF7A50] py-3.5 text-sm font-black text-white"
              >
                <Navigation size={16} />
                Navigate to Customer
                <ArrowRight size={14} className="opacity-70" />
              </a>
            )}
          </div>

          {order.customer && (
            <div className="mx-4 grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Customer</p>
                <p className="font-bold text-white text-sm truncate leading-tight">{order.customer.full_name}</p>
                <div className="flex items-center gap-3 mt-2">
                  {order.customer.phone && (
                    <a href={`tel:${order.customer.phone}`} className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                      <Phone size={12} /> Call
                    </a>
                  )}
                  <button
                    onClick={() => router.push(`/messages/order-${order.id}`)}
                    className="flex items-center gap-1.5 text-[#FF7A50] text-xs font-semibold"
                  >
                    <MessageCircle size={12} /> Message
                  </button>
                </div>
              </div>
              <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">You earn</p>
                <p className="font-black text-[#FF7A50] text-3xl leading-none">${earn.toFixed(2)}</p>
                {order.tip_amount > 0 && (
                  <p className="text-xs text-green-400 mt-1.5 font-semibold">incl. ${order.tip_amount.toFixed(2)} tip</p>
                )}
              </div>
            </div>
          )}

          {order.dropoff_note && (
            <div className="mx-4 mb-3 bg-[#FF7A50]/10 border border-[#FF7A50]/30 rounded-2xl px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <MessageSquare size={15} className="text-[#FF7A50] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Drop-off Instructions</p>
                  <p className="text-sm text-zinc-200 leading-relaxed">{order.dropoff_note}</p>
                </div>
              </div>
            </div>
          )}

          {order.payment_method === 'cash' && (
            <div className="mx-4 mb-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5">
              <Banknote size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-300">Collect cash at drop-off</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Confirm the total with the customer before leaving</p>
              </div>
            </div>
          )}

          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#FF7A50]/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={14} className="text-[#FF7A50]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-600">Picked up from</p>
              <p className="text-sm font-bold text-zinc-300 truncate">{order.food_maker?.display_name}</p>
            </div>
            <Star size={13} className="text-zinc-700 flex-shrink-0" />
          </div>
        </>
      )}

      {/* ── Stage: Arrived at Customer ── */}
      {isAtCustomer && (
        <>
          <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-300">You've arrived at the customer</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Hand over the order and confirm delivery</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Timer size={11} className="text-amber-400" />
              <span className="text-amber-300 font-black text-sm tabular-nums">{formatElapsed(elapsed)}</span>
            </div>
          </div>

          {order.dropoff_note && (
            <div className="mx-4 mb-3 bg-[#FF7A50]/10 border-2 border-[#FF7A50]/40 rounded-2xl px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <MessageSquare size={16} className="text-[#FF7A50] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Drop-off Instructions</p>
                  <p className="text-sm font-semibold text-zinc-100 leading-relaxed">{order.dropoff_note}</p>
                </div>
              </div>
            </div>
          )}

          {order.customer && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl p-3.5 border border-white/5">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Customer</p>
              <p className="font-bold text-white text-sm">{order.customer.full_name}</p>
              {order.customer.phone ? (
                <a href={`tel:${order.customer.phone}`} className="mt-2 flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                  <Phone size={12} /> Call customer
                </a>
              ) : (
                <p className="text-xs text-zinc-700 mt-2">No phone on file</p>
              )}
            </div>
          )}

          {addr && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3.5">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Delivery address</p>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-zinc-300">{addr.street}</p>
                  <p className="text-xs text-zinc-500">{addr.city}, {addr.state} {addr.zip}</p>
                  {addr.label && <p className="text-xs text-zinc-600 mt-0.5 italic">{addr.label}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── Proof photo capture ── */}
          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 pt-3.5 pb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide">Photo of Delivery</p>
                <span className="text-[10px] font-medium">
                  {proofUploadError
                    ? <span className="text-amber-400">Upload failed — order still completed</span>
                    : requiresProof
                      ? <span className="text-[#FF7A50]">Required</span>
                      : <span className="text-zinc-700">Optional</span>
                  }
                </span>
              </div>

              {proofPhotoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofPhotoUrl}
                    alt="Proof of delivery"
                    className="w-full h-40 object-cover rounded-xl"
                  />
                  <button
                    onClick={() => {
                      setProofPhoto(null)
                      if (proofPhotoUrl) URL.revokeObjectURL(proofPhotoUrl)
                      setProofPhotoUrl(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1.5 rounded-full"
                  >
                    <RotateCcw size={11} />
                    Retake
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-800 rounded-xl py-6 active:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                    <Camera size={20} className="text-zinc-500" />
                  </div>
                  <p className="text-sm font-bold text-zinc-500">Tap to take photo</p>
                  <p className="text-xs text-zinc-700">Helps verify contactless drop-offs</p>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleProofPhotoSelect}
              />
            </div>
          </div>

          {order.payment_method === 'cash' && (
            <div className="mx-4 mb-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5">
              <Banknote size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-300">Collect cash before confirming</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Confirm the total with the customer before completing delivery</p>
              </div>
            </div>
          )}

          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-zinc-600">Your earnings</p>
            <div className="text-right">
              <p className="font-black text-[#FF7A50]">${earn.toFixed(2)}</p>
              {order.tip_amount > 0 && (
                <p className="text-[10px] text-green-400">incl. ${order.tip_amount.toFixed(2)} tip</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Can't Deliver modal ── */}
      {showCantDeliver && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !submittingFailed && setShowCantDeliver(false)} />
          <div className="relative w-full max-w-[430px] mx-auto bg-[#111] rounded-t-3xl p-5 pb-10 border-t border-white/10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black text-white">Can't Complete Delivery</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Select a reason to notify support</p>
              </div>
              <button onClick={() => setShowCantDeliver(false)} className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                <X size={14} className="text-zinc-400" />
              </button>
            </div>

            <div className="space-y-2 mb-5">
              {CANT_DELIVER_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setCantDeliverReason(reason)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all border ${
                    cantDeliverReason === reason
                      ? 'border-red-500/60 bg-red-500/10'
                      : 'border-white/8 bg-[#1A1A1A]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    cantDeliverReason === reason ? 'border-red-400' : 'border-zinc-600'
                  }`}>
                    {cantDeliverReason === reason && <div className="w-2 h-2 rounded-full bg-red-400" />}
                  </div>
                  <span className={`text-sm ${cantDeliverReason === reason ? 'text-white font-semibold' : 'text-zinc-400'}`}>
                    {reason}
                  </span>
                </button>
              ))}
            </div>

            {failedError && (
              <p className="text-xs text-red-400 text-center mb-3 bg-red-500/10 rounded-xl px-4 py-2">{failedError}</p>
            )}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 mb-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  A support ticket will be created automatically. The customer will be notified and our team will follow up to resolve this.
                </p>
              </div>
            </div>

            <button
              onClick={handleCantDeliver}
              disabled={!cantDeliverReason || submittingFailed}
              className="w-full bg-red-500 disabled:bg-[#1A1A1A] disabled:text-zinc-700 text-white font-black py-4 rounded-2xl text-base active:scale-[0.98] transition-all"
            >
              {submittingFailed ? 'Submitting…' : 'Report & Contact Support'}
            </button>
          </div>
        </div>
      )}

      {/* ── Fixed CTA ── */}
      {/* isAtMaker has no CTA — the maker triggers the transition via PIN */}
      {nextAction && !isAtMaker && (
        <div className="fixed bottom-[68px] left-0 right-0 max-w-[430px] mx-auto px-4 pb-4 pt-3 bg-gradient-to-t from-[#080808] via-[#080808]/95 to-transparent">
          {updateError && (
            <div className="mb-2 px-4 py-2.5 bg-red-500/15 border border-red-500/30 rounded-2xl text-xs font-semibold text-red-400 text-center">
              {updateError}
            </div>
          )}

          {isAtCustomer ? (
            <>
              {requiresProof && !proofPhoto && (
                <p className="text-center text-xs font-bold text-[#FF7A50] mb-2">
                  Take a photo of the drop-off before completing delivery
                </p>
              )}
              <SlideToConfirm
                onConfirm={() => handleStatusUpdate('delivered')}
                label="Slide to Complete"
                disabled={updating || (requiresProof && !proofPhoto)}
              />
            </>
          ) : (
            <button
              onClick={() => handleStatusUpdate(nextAction.next)}
              disabled={updating}
              className="w-full text-white rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2.5 disabled:opacity-50 transition-all shadow-lg active:scale-[0.98] bg-[#FF7A50] shadow-[#FF7A50]/25"
            >
              {updating ? (
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Navigation size={20} />
              )}
              {updating ? 'Updating…' : nextAction.label}
            </button>
          )}

          {(isAtCustomer || isHeadingToCustomer) && (
            <button
              onClick={() => { setShowCantDeliver(true); setCantDeliverReason(null); setFailedError(null) }}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 text-red-400 text-sm font-bold"
            >
              <AlertTriangle size={14} />
              Can't Deliver
            </button>
          )}
        </div>
      )}

      </>} {/* end activeTab === 'active' */}

    </div>
  )
}
