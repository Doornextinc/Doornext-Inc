'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AlertTriangle, CheckCircle, Circle, Clock, MapPin, MessageCircle, Star, XCircle } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { cn, ORDER_STATUS_LABELS, haversineDistance, estimateMinutes, formatEta, arrivalTimeStr } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useOrderTracking } from '@/hooks/useOrderTracking'
import { OrderClaimDialog } from '@/components/OrderClaimDialog'
import type { Order, OrderStatus, OrderItem } from '@/types'
import { playWithHaptic, type CustomerSoundType } from '@/lib/notification-sounds'

const DeliveryMap = dynamic(
  () => import('@/components/DeliveryMap').then((m) => m.DeliveryMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0d1117] animate-pulse" /> }
)

const STATUS_STEPS: OrderStatus[] = [
  'confirmed', 'preparing', 'ready', 'driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer', 'delivered',
]

const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  pending: 'Waiting for the kitchen to confirm your order...',
  confirmed: 'Your order has been confirmed! 🎉',
  preparing: 'The maker is cooking your food 🍳',
  ready: 'Your order is ready for pickup!',
  driver_assigned: 'A driver has accepted your order and is heading to the restaurant 🚗',
  arrived_at_maker: 'Your driver has arrived at the restaurant 📦',
  picked_up: 'Your Nexter picked up your order!',
  on_the_way: 'Your Nexter is on the way 🛵',
  arrived_at_customer: 'Your driver has arrived at your location!',
  delivered: 'Delivered! Enjoy your meal 🎉',
  failed_delivery: 'Delivery was unsuccessful. Our support team will reach out shortly.',
  cancelled: 'Order was cancelled',
}

interface FullOrder extends Omit<Order, 'food_maker'> {
  food_maker: { id: string; display_name: string; lat: number; lng: number; prep_time_mins: number }
  order_items: Array<OrderItem & { menu_item: { name: string; price: number } }>
  nexter?: { full_name: string; avatar_url: string | null } | null
  payment_method?: 'card' | 'cash'
}

interface OrderClaim {
  id: string
  type: 'refund' | 'replacement'
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  seller_notes: string | null
  created_at: string
}

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<FullOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTip, setShowTip] = useState(false)
  const [tipPct, setTipPct] = useState(0.15)
  const [tipSubmitting, setTipSubmitting] = useState(false)
  const [tipDone, setTipDone] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [rating, setRating] = useState(0)
  const [driverRating, setDriverRating] = useState(0)
  const [foodQuality, setFoodQuality] = useState<string | null>(null)
  const [packagingQuality, setPackagingQuality] = useState<string | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [showClaim, setShowClaim] = useState(false)
  const [claim, setClaim] = useState<OrderClaim | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const { status: realtimeStatus, nexterLocation } = useOrderTracking(
    id,
    order?.nexter_id ?? null
  )

  // Play a sound when the order status transitions to a notable step
  const prevStatusRef = useRef<OrderStatus | null>(null)
  useEffect(() => {
    const prev = prevStatusRef.current
    const next = realtimeStatus
    if (!next || next === prev) return
    prevStatusRef.current = next
    // Map order status → sound type
    const SOUND_MAP: Partial<Record<OrderStatus, CustomerSoundType>> = {
      confirmed:          'order_confirmed',
      preparing:          'order_preparing',
      driver_assigned:    'driver_assigned',
      arrived_at_maker:   'driver_assigned',
      picked_up:          'driver_assigned',
      on_the_way:         'driver_assigned',
      arrived_at_customer:'driver_arrived',
      delivered:          'delivered',
    }
    const sound = SOUND_MAP[next]
    if (sound) playWithHaptic(sound)
  }, [realtimeStatus])

  const currentStatus: OrderStatus = realtimeStatus ?? order?.status ?? 'pending'

  const loadOrder = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          payment_method,
          food_maker:food_makers(id, display_name, lat, lng, prep_time_mins),
          order_items(*, menu_item:menu_items(name, price)),
          nexter:users!orders_nexter_id_fkey(full_name, avatar_url)
        `)
        .eq('id', id)
        .eq('customer_id', user.id)
        .single()

      if (!error && data) {
        setUserId(user.id)

        // Check if review already submitted to avoid showing modal again
        const { count } = await supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', id)
          .eq('customer_id', user.id)
        const alreadyReviewed = (count ?? 0) > 0
        setReviewSubmitted(alreadyReviewed)

        // Fetch existing claim for this order
        const { data: existingClaim } = await supabase
          .from('order_claims')
          .select('id, type, status, reason, seller_notes, created_at')
          .eq('order_id', id)
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setClaim(existingClaim as OrderClaim | null)

        setOrder(data as FullOrder)
        const alreadyTipped = (data.tip_amount ?? 0) > 0
        setTipDone(alreadyTipped)
        if (data.status === 'delivered') {
          if (!alreadyTipped) {
            // Show tip first, review will be triggered after tip is dismissed
            setTimeout(() => setShowTip(true), 1000)
          } else if (!alreadyReviewed) {
            // Already tipped — show review directly
            reviewTimerRef.current = setTimeout(() => setShowReview(true), 1500)
          }
        }
      }
    } catch (e) {
      console.error('Failed to load order:', e)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // When delivery status arrives via realtime: show tip → then review flows from tip close
  useEffect(() => {
    if (realtimeStatus !== 'delivered') return
    if (!tipDone) {
      setTimeout(() => setShowTip(true), 1500)
    } else if (!reviewSubmitted) {
      reviewTimerRef.current = setTimeout(() => setShowReview(true), 1500)
    }
    return () => { if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current) }
  }, [realtimeStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelOrder = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCancelError(data.error ?? 'Cancellation failed. Please try again.')
        setCancelling(false)
        return
      }
      setShowCancelConfirm(false)
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev)
    } catch {
      setCancelError('Network error. Please try again.')
    }
    setCancelling(false)
  }

  const submitTip = async (amount: number) => {
    setTipSubmitting(true)
    try {
      await fetch('/api/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, tipAmount: amount }),
      })
    } catch (e) {
      console.error('Tip submission failed:', e)
    } finally {
      setTipSubmitting(false)
      setTipDone(true)
      setShowTip(false)
      // Show review prompt right after tip is dismissed
      if (!reviewSubmitted) {
        reviewTimerRef.current = setTimeout(() => setShowReview(true), 2000)
      }
    }
  }

  const submitReview = async () => {
    if (!order || rating === 0) return
    setSubmittingReview(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('reviews').upsert({
        order_id: order.id,
        customer_id: user.id,
        maker_id: order.maker_id,
        nexter_id: order.nexter_id ?? null,
        rating,
        driver_rating: driverRating > 0 ? driverRating : null,
        body: reviewText.trim() || null,
        food_quality: foodQuality,
        packaging_quality: packagingQuality,
      }, { onConflict: 'order_id,customer_id' })

      setReviewSubmitted(true)
      setShowReview(false)
      router.push('/orders')
    } catch (e) {
      console.error('Review submission failed:', e)
    } finally {
      setSubmittingReview(false)
    }
  }

  const currentStep = STATUS_STEPS.indexOf(currentStatus)

  type DeliveryAddr = { street?: string; city?: string; state?: string; lat?: number; lng?: number } | null
  const deliveryAddr = order?.delivery_address as DeliveryAddr

  // ── ETA calculation ─────────────────────────────────────────────────────────
  const etaInfo = useMemo(() => {
    if (!order) return null
    const cLat = deliveryAddr?.lat
    const cLng = deliveryAddr?.lng
    const mLat = order.food_maker?.lat
    const mLng = order.food_maker?.lng

    // Prep stage: estimate remaining cook time based on prep_time_mins + when preparing started
    if (currentStatus === 'preparing' && order.food_maker?.prep_time_mins) {
      const prepMins = order.food_maker.prep_time_mins
      const startedMs = order.updated_at ? new Date(order.updated_at).getTime() : Date.now()
      const elapsedMins = (Date.now() - startedMs) / 60_000
      const remaining = Math.max(0, Math.ceil(prepMins - elapsedMins))
      return remaining < 2
        ? { label: 'Almost ready!', arrival: null }
        : { label: `~${remaining} min`, arrival: arrivalTimeStr(remaining) }
    }

    // Order ready but no driver yet: show minimum possible ETA from maker to customer
    if (currentStatus === 'ready' && mLat && mLng && cLat && cLng) {
      const mins = estimateMinutes(haversineDistance(mLat, mLng, cLat, cLng))
      return { label: `~${formatEta(mins)} away`, arrival: arrivalTimeStr(mins) }
    }

    // Driver assigned / at maker: show transit time from restaurant to customer
    if ((currentStatus === 'driver_assigned' || currentStatus === 'arrived_at_maker') && mLat && mLng && cLat && cLng) {
      const mins = estimateMinutes(haversineDistance(mLat, mLng, cLat, cLng))
      return { label: `~${formatEta(mins)} away`, arrival: arrivalTimeStr(mins) }
    }

    // Picked up or on the way: use live driver location if available, else fallback to maker
    if (currentStatus === 'picked_up' || currentStatus === 'on_the_way') {
      if (cLat && cLng) {
        const dLat = nexterLocation?.lat ?? mLat
        const dLng = nexterLocation?.lng ?? mLng
        if (dLat && dLng) {
          const mins = estimateMinutes(haversineDistance(dLat, dLng, cLat, cLng))
          return { label: `~${formatEta(mins)} away`, arrival: arrivalTimeStr(mins) }
        }
      }
    }

    if (currentStatus === 'arrived_at_customer') {
      return { label: 'Driver at your door!', arrival: null }
    }

    return null
  }, [currentStatus, order, deliveryAddr, nexterLocation])
  const hasMapCoords =
    order?.food_maker?.lat &&
    order?.food_maker?.lng &&
    deliveryAddr?.lat &&
    deliveryAddr?.lng

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Order Tracking" />
        <div className="w-full h-52 bg-gray-100 animate-pulse" />
        <div className="flex-1 px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Order Tracking" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">Order not found</p>
        </div>
      </div>
    )
  }

  const addr = deliveryAddr

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Order Tracking" />

      {/* Cancel banner — only shown before preparation starts */}
      {(currentStatus === 'pending' || currentStatus === 'confirmed') && (
        <div className="mx-4 mt-3 flex items-center justify-between bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          <div>
            <p className="text-xs font-bold text-red-600">Need to cancel?</p>
            <p className="text-[11px] text-red-400 mt-0.5">Free cancellation before preparation starts</p>
          </div>
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all"
          >
            <XCircle size={13} />
            Cancel Order
          </button>
        </div>
      )}

      {/* Map */}
      <div className="relative w-full h-52 bg-[#0d1117] overflow-hidden">
        {hasMapCoords && order ? (
          <DeliveryMap
            maker={{
              lat: order.food_maker.lat,
              lng: order.food_maker.lng,
              name: order.food_maker.display_name,
            }}
            customer={{
              lat: (order.delivery_address as { lat: number }).lat,
              lng: (order.delivery_address as { lng: number }).lng,
            }}
            driver={nexterLocation}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="relative">
              <div className="w-8 h-8 bg-[#FF6B35] rounded-full flex items-center justify-center shadow-lg shadow-orange-300">
                <span className="text-white text-sm">🛵</span>
              </div>
              <div className="absolute -inset-2 bg-[#FF6B35]/20 rounded-full animate-ping" />
            </div>
          </div>
        )}
        {/* Route label + live ETA pill */}
        {hasMapCoords && (
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between pointer-events-none">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              {nexterLocation ? '🛵 Driver en route' : '🍳 Kitchen → 📍 You'}
            </div>
            {etaInfo && (currentStatus === 'on_the_way' || currentStatus === 'picked_up') && (
              <div className="bg-[#FF6B35] rounded-lg px-2.5 py-1 text-xs font-black text-white shadow-sm">
                {etaInfo.label}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Card */}
      <div className="bg-white mx-4 -mt-4 rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wide">
              {ORDER_STATUS_LABELS[currentStatus]}
            </p>
            <p className="font-bold text-gray-900 mt-0.5 text-base">
              {STATUS_MESSAGES[currentStatus] ?? 'Processing your order...'}
            </p>
          </div>
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1.5 rounded-xl flex-shrink-0">
              <Clock size={13} className="text-[#FF6B35]" />
              <span className="text-xs font-bold text-[#FF6B35]">Live</span>
            </div>
          )}
        </div>

        {/* ETA row */}
        {etaInfo && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                <Clock size={13} className="text-[#FF6B35]" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium leading-none mb-0.5">Estimated delivery</p>
                <p className="text-base font-black text-gray-900 leading-none">{etaInfo.label}</p>
              </div>
            </div>
            {etaInfo.arrival && (
              <div className="text-right">
                <p className="text-xs text-gray-400 font-medium leading-none mb-0.5">Arrives by</p>
                <p className="text-base font-black text-[#FF6B35] leading-none">{etaInfo.arrival}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Progress Steps */}
        <div className="bg-white rounded-2xl p-4">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Order Progress</h3>
          <div className="space-y-0">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = currentStep >= 0 && i <= currentStep
              const isCurrent = i === currentStep
              const isLast = i === STATUS_STEPS.length - 1
              return (
                <div key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500',
                      isCompleted ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-300'
                    )}>
                      {isCompleted ? <CheckCircle size={14} /> : <Circle size={14} />}
                    </div>
                    {!isLast && (
                      <div className={cn(
                        'w-0.5 h-8 mt-1 transition-all duration-700',
                        i < currentStep ? 'bg-[#FF6B35]' : 'bg-gray-100'
                      )} />
                    )}
                  </div>
                  <div className="pb-8 last:pb-0">
                    <p className={cn(
                      'text-sm font-semibold leading-tight',
                      isCurrent ? 'text-[#FF6B35]' : isCompleted ? 'text-gray-700' : 'text-gray-300'
                    )}>
                      {ORDER_STATUS_LABELS[step]}
                    </p>
                    {isCurrent && <p className="text-xs text-gray-400 mt-0.5">In progress...</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Nexter Info */}
        {(currentStatus === 'picked_up' || currentStatus === 'on_the_way' || currentStatus === 'delivered') && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Your Nexter</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {order.nexter?.full_name?.[0] ?? 'N'}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {order.nexter?.full_name ?? 'Your Nexter'}
                  </p>
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-gray-500">On the way</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push(`/chat/order-${order.id}`)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <MessageCircle size={18} className="text-gray-600" />
              </button>
            </div>
          </div>
        )}

        {/* Delivery Address */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900 text-sm">Delivering to</h3>
          </div>
          <p className="text-sm text-gray-600">
            {addr?.street ? `${addr.street}, ${addr.city ?? ''}, ${addr.state ?? ''}` : 'Address on file'}
          </p>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm">
              Order from {order.food_maker.display_name}
            </h3>
            {order.status !== 'cancelled' && (
              <button
                onClick={() => router.push(`/chat/order-${order.id}`)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#FF6B35]"
              >
                <MessageCircle size={14} />
                Message
              </button>
            )}
          </div>
          {order.order_items.map((oi) => (
            <div key={oi.id} className="flex justify-between text-sm py-1.5 text-gray-600">
              <span>{oi.quantity}x {oi.menu_item?.name ?? 'Item'}</span>
              <span>${(oi.unit_price * oi.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="h-px bg-gray-100 my-2" />
          <div className="space-y-1 text-sm text-gray-500">
            <div className="flex justify-between">
              <span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span><span>${order.delivery_fee.toFixed(2)}</span>
            </div>
            {(order.platform_fee ?? 0) > 0 && (
              <div className="flex justify-between">
                <span>Service fee</span><span>${(order.platform_fee as number).toFixed(2)}</span>
              </div>
            )}
            {order.tip_amount > 0 && (
              <div className="flex justify-between">
                <span>Tip</span><span>${order.tip_amount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="h-px bg-gray-100 my-2" />
          <div className="flex justify-between font-bold text-gray-900 text-sm">
            <span>{order.payment_method === 'cash' ? 'Total (cash)' : 'Total paid'}</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Claim status card — shown once a claim exists */}
        {claim && (
          <div className={cn(
            'rounded-2xl border-2 p-4',
            claim.status === 'pending'  && 'border-yellow-200 bg-yellow-50',
            claim.status === 'approved' && 'border-green-200 bg-green-50',
            claim.status === 'rejected' && 'border-red-200 bg-red-50',
          )}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={15} className={cn(
                claim.status === 'pending'  && 'text-yellow-500',
                claim.status === 'approved' && 'text-green-600',
                claim.status === 'rejected' && 'text-red-500',
              )} />
              <p className={cn(
                'text-sm font-bold capitalize',
                claim.status === 'pending'  && 'text-yellow-700',
                claim.status === 'approved' && 'text-green-700',
                claim.status === 'rejected' && 'text-red-700',
              )}>
                {claim.type === 'refund' ? 'Refund' : 'Replacement'} request —{' '}
                {claim.status === 'pending' ? 'Under review' : claim.status}
              </p>
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{claim.reason}</p>
            {claim.seller_notes && (
              <p className="text-xs text-gray-600 mt-2 italic">
                <span className="font-semibold not-italic">Kitchen:</span> {claim.seller_notes}
              </p>
            )}
          </div>
        )}

        {/* Report issue button — shown 30 min after delivery, only if no claim yet */}
        {currentStatus === 'delivered' && !claim && (() => {
          const deliveredAt = order.updated_at ? new Date(order.updated_at).getTime() : 0
          const withinWindow = Date.now() - deliveredAt < 30 * 60 * 1000
          return withinWindow ? (
            <button
              onClick={() => setShowClaim(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-500 active:scale-[0.98] transition-all"
            >
              <AlertTriangle size={15} />
              Report an issue with this order
            </button>
          ) : null
        })()}
      </div>

      {/* Tip Modal */}
      {showTip && !tipDone && order && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-[88px]">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <div className="text-center mb-5">
              <span className="text-4xl">🛵</span>
              <h2 className="text-xl font-black text-gray-900 mt-3">Tip Your Nexter</h2>
              <p className="text-gray-500 text-sm mt-1">100% goes directly to your driver</p>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[{ label: 'No tip', value: 0 }, { label: '10%', value: 0.1 }, { label: '15%', value: 0.15 }, { label: '20%', value: 0.2 }].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setTipPct(value)}
                  className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                    tipPct === value ? 'bg-[#FF6B35] text-white border-[#FF6B35]' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {label}
                  {value > 0 && <div className="text-xs opacity-70 mt-0.5">${(order.subtotal * value).toFixed(2)}</div>}
                </button>
              ))}
            </div>
            <Button
              fullWidth size="lg"
              loading={tipSubmitting}
              onClick={() => submitTip(Math.round(order.subtotal * tipPct * 100) / 100)}
            >
              {tipPct === 0 ? 'Skip tip' : `Tip $${(order.subtotal * tipPct).toFixed(2)}`}
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => !cancelling && setShowCancelConfirm(false)} />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-[88px]">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Cancel this order?</h2>
              <p className="text-gray-500 text-sm mt-2">
                {order.payment_method === 'cash'
                  ? 'Your order will be cancelled. No charge will be made.'
                  : `You'll receive a full refund of $${order.total.toFixed(2)} in 3–5 business days.`}
              </p>
              <p className="text-xs text-orange-500 font-semibold mt-3 bg-orange-50 rounded-xl px-3 py-2">
                Once the maker starts preparing, cancellation is not possible.
              </p>
            </div>
            {cancelError && (
              <p className="text-center text-sm text-red-500 mb-4 bg-red-50 rounded-xl px-4 py-2">{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(null) }}
                disabled={cancelling}
                className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm disabled:opacity-50"
              >
                Keep Order
              </button>
              <button
                onClick={cancelOrder}
                disabled={cancelling}
                className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-black text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim Dialog */}
      {showClaim && order && userId && (
        <OrderClaimDialog
          orderId={order.id}
          customerId={userId}
          items={order.order_items.map(oi => ({
            id:         oi.id,
            quantity:   oi.quantity,
            unit_price: oi.unit_price,
            name:       oi.menu_item?.name ?? 'Item',
          }))}
          onClose={() => setShowClaim(false)}
          onClaimCreated={async () => {
            const supabase = createClient()
            const { data } = await supabase
              .from('order_claims')
              .select('id, type, status, reason, seller_notes, created_at')
              .eq('order_id', id)
              .eq('customer_id', userId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            setClaim(data as OrderClaim | null)
            setShowClaim(false)
          }}
        />
      )}

      {/* Review Modal */}
      {showReview && !reviewSubmitted && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReview(false)} />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl pb-[88px] overflow-hidden">
            {/* Scrollable content */}
            <div className="max-h-[80svh] overflow-y-auto px-6 pt-6">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

              {/* Header */}
              <div className="text-center mb-5">
                <span className="text-4xl">🎉</span>
                <h2 className="text-xl font-black text-gray-900 mt-2">How was your order?</h2>
                <p className="text-gray-400 text-sm mt-1">{order.food_maker.display_name}</p>
              </div>

              {/* Overall rating */}
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Overall</p>
              <div className="flex justify-center gap-3 mb-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} onClick={() => setRating(i)} className="transition-transform active:scale-110">
                    <Star
                      size={38}
                      className={i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
                    />
                  </button>
                ))}
              </div>

              {/* Food quality */}
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Food quality</p>
              <div className="grid grid-cols-4 gap-2 mb-5">
                {[
                  { label: 'Poor',      emoji: '😞', value: 'poor'      },
                  { label: 'Okay',      emoji: '😐', value: 'okay'      },
                  { label: 'Good',      emoji: '😊', value: 'good'      },
                  { label: 'Amazing',   emoji: '🤩', value: 'amazing'   },
                ].map(({ label, emoji, value }) => (
                  <button
                    key={value}
                    onClick={() => setFoodQuality(foodQuality === value ? null : value)}
                    className={`flex flex-col items-center py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      foodQuality === value
                        ? 'bg-[#FF6B35]/10 border-[#FF6B35] text-[#FF6B35]'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className="text-xl mb-1">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Packaging */}
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Packaging</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: 'Damaged',  emoji: '📦💔', value: 'damaged'  },
                  { label: 'Fine',     emoji: '📦',   value: 'fine'     },
                  { label: 'Perfect',  emoji: '💯',   value: 'perfect'  },
                ].map(({ label, emoji, value }) => (
                  <button
                    key={value}
                    onClick={() => setPackagingQuality(packagingQuality === value ? null : value)}
                    className={`flex flex-col items-center py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      packagingQuality === value
                        ? 'bg-[#FF6B35]/10 border-[#FF6B35] text-[#FF6B35]'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className="text-xl mb-1">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Driver rating — only if a driver was assigned */}
              {order.nexter_id && (
                <>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Rate your driver</p>
                  <div className="flex justify-center gap-3 mb-5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button key={i} onClick={() => setDriverRating(i)} className="transition-transform active:scale-110">
                        <Star
                          size={32}
                          className={i <= driverRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Text */}
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Tell others what you loved (or didn't) about this meal..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] focus:outline-none transition-all mb-4"
                rows={3}
              />

              <Button fullWidth size="lg" loading={submittingReview} onClick={submitReview} disabled={rating === 0}>
                Submit Review
              </Button>
              <button
                onClick={() => { setShowReview(false); router.push('/orders') }}
                className="w-full text-center text-sm text-gray-400 mt-3 mb-2"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
