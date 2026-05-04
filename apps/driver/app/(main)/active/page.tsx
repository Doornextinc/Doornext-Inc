'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import type { OrderStatus } from '@doornext/shared/types'
import {
  MapPin, Phone, CheckCircle, Navigation, Package,
  ChevronDown, ChevronUp, Banknote, ArrowRight, Clock, Star, AlertTriangle, X, MessageCircle,
  ChevronRight, Camera, RotateCcw, MessageSquare, Timer,
} from 'lucide-react'
import { haversineDistance, estimateMinutes, formatEta, arrivalTimeStr, formatDistance } from '@doornext/shared/utils'
import { AppHeader } from '@/components/layout/app-header'
import { playWithHaptic } from '@/lib/notification-sounds'

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
}

// 6 milestone stages shown in the progress stepper
const STEPS = [
  { status: 'driver_assigned',    label: 'Heading Out',     sublabel: 'Drive to restaurant' },
  { status: 'arrived_at_maker',   label: 'At Restaurant',   sublabel: 'Verify & pick up' },
  { status: 'picked_up',          label: 'Picked Up',       sublabel: 'Start delivery' },
  { status: 'on_the_way',         label: 'On the Way',      sublabel: 'Drive to customer' },
  { status: 'arrived_at_customer', label: 'At Customer',    sublabel: 'Complete dropoff' },
  { status: 'delivered',          label: 'Delivered',       sublabel: 'Order complete' },
]

// What action button to show at each status.
// NOTE: 'arrived_at_maker' is intentionally absent — that transition to
// 'picked_up' is triggered by the maker entering the PIN on their device.
const NEXT_ACTION: Record<string, { next: OrderStatus; label: string }> = {
  driver_assigned:     { next: 'arrived_at_maker',   label: 'Arrived at Restaurant' },
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

function mapsUrl(addr: ActiveOrder['delivery_address']): string {
  if (!addr) return '#'
  return `https://maps.google.com/?q=${encodeURIComponent(`${addr.street}, ${addr.city}, ${addr.state}`)}`
}

function makerMapsUrl(maker: ActiveOrder['food_maker']): string {
  if (!maker) return '#'
  if (maker.lat && maker.lng) return `https://maps.google.com/?q=${maker.lat},${maker.lng}`
  return `https://maps.google.com/?q=${encodeURIComponent(maker.display_name)}`
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

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { setActiveOrder, setLocation } = useDriverStore()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const storeActiveOrderId = useDriverStore((s) => s.activeOrderId)
  const driverLat = useDriverStore((s) => s.currentLat)
  const driverLng = useDriverStore((s) => s.currentLng)
  const [order, setOrder] = useState<ActiveOrder | null>(null)
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
  // Proof photo state
  const [proofPhoto, setProofPhoto] = useState<File | null>(null)
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null)
  const [proofUploadError, setProofUploadError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        // On transient server errors, don't clear the order — keep showing
        // whatever was loaded before so the driver isn't kicked out mid-delivery.
        setLoading(false)
        return
      }
      const { order } = await res.json()
      if (order) {
        setOrder(order as ActiveOrder)
        setActiveOrder(order.id)
      } else {
        setOrder(null)
        setActiveOrder(null)
      }
    } catch {
      // Network error — same: don't clear, just stop loading
    } finally {
      setLoading(false)
    }
  }, [router, setActiveOrder, userId, authReady, hasHydrated])

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

  // Real-time: detect when maker confirms pickup PIN (status → picked_up)
  // or any other external order status change.
  useEffect(() => {
    if (!order) return
    const supabase = createClient()
    const channel = supabase
      .channel(`driver-order-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          const newStatus = payload.new.status as string
          // Patch status locally for instant UI response, then re-fetch for full data
          setOrder((prev) => prev ? { ...prev, status: newStatus, updated_at: payload.new.updated_at ?? prev.updated_at } : prev)
          if (newStatus === 'picked_up') {
            playWithHaptic('order_ready')
          }
          // Re-fetch full order in background so all fields stay in sync
          fetch('/api/driver/active-order')
            .then(r => r.ok ? r.json() : null)
            .then(json => { if (json?.order) setOrder(json.order as ActiveOrder) })
            .catch(() => {})
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        setActiveOrder(null)
        setDelivered(true)
      } else {
        setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
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
        <AppHeader title="Active Delivery" />
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

  /* ── No active order ── */
  if (!order && storeActiveOrderId && retryCount < MAX_RETRIES) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Active Delivery" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-[3px] border-[#FF7A50] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Active Delivery" />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-24 h-24 rounded-3xl bg-[#141414] border border-white/5 flex items-center justify-center mb-6">
            <Package size={44} className="text-zinc-600" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">No active delivery</h2>
          <p className="text-zinc-500 text-base mb-8">Accept a pickup to start delivering</p>
          <button
            onClick={() => router.push('/')}
            className="bg-[#FF7A50] text-white rounded-2xl px-10 py-4 font-black text-base shadow-lg shadow-[#FF7A50]/20"
          >
            Go to Home
          </button>
        </div>
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

  return (
    <div className="flex flex-col min-h-full pb-[144px]">
      <AppHeader title="Active Delivery" />

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
          <span className="text-xs text-zinc-500">You earn</span>
          <span className="font-black text-[#FF7A50] text-sm">${earn.toFixed(2)}</span>
          {order.tip_amount > 0 && (
            <span className="text-xs text-green-400 font-semibold ml-1">+${order.tip_amount.toFixed(2)} tip</span>
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
    </div>
  )
}
