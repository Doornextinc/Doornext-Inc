'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle, Circle, Clock, MapPin, MessageCircle, Star } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { cn, ORDER_STATUS_LABELS } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useOrderTracking } from '@/hooks/useOrderTracking'
import type { Order, OrderStatus, OrderItem } from '@/types'

const STATUS_STEPS: OrderStatus[] = [
  'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered',
]

const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  pending: 'Waiting for the kitchen to confirm your order...',
  confirmed: 'Your order has been confirmed! 🎉',
  preparing: 'The maker is cooking your food 🍳',
  ready: 'Your order is ready for pickup!',
  picked_up: 'Your Nexter picked up your order!',
  on_the_way: 'Your Nexter is on the way 🛵',
  delivered: 'Delivered! Enjoy your meal 🎉',
  cancelled: 'Order was cancelled',
}

interface FullOrder extends Omit<Order, 'food_maker'> {
  food_maker: { id: string; display_name: string; lat: number; lng: number }
  order_items: Array<OrderItem & { menu_item: { name: string; price: number } }>
  nexter?: { full_name: string; avatar_url: string | null } | null
  payment_method?: 'card' | 'cash'
}

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<FullOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReview, setShowReview] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  const { status: realtimeStatus, nexterLocation } = useOrderTracking(
    id,
    order?.nexter_id ?? null
  )

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
          food_maker:food_makers(id, display_name, lat, lng),
          order_items(*, menu_item:menu_items(name, price)),
          nexter:users!orders_nexter_id_fkey(full_name, avatar_url)
        `)
        .eq('id', id)
        .eq('customer_id', user.id)
        .single()

      if (!error && data) {
        // Check if review already submitted to avoid showing modal again
        const { count } = await supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', id)
          .eq('customer_id', user.id)
        const alreadyReviewed = (count ?? 0) > 0
        setReviewSubmitted(alreadyReviewed)
        setOrder(data as FullOrder)
        if (data.status === 'delivered' && !alreadyReviewed) {
          setTimeout(() => setShowReview(true), 1000)
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

  // Show review modal when delivered via realtime
  useEffect(() => {
    if (realtimeStatus === 'delivered' && !reviewSubmitted) {
      setTimeout(() => setShowReview(true), 1500)
    }
  }, [realtimeStatus, reviewSubmitted])

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
        rating,
        body: reviewText.trim() || null,
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

  // Build Google Static Maps URL
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapUrl = order?.food_maker && apiKey
    ? (() => {
        const makerMarker = `markers=color:orange%7Clabel:M%7C${order.food_maker.lat},${order.food_maker.lng}`
        const driverMarker = nexterLocation
          ? `&markers=color:blue%7Clabel:D%7C${nexterLocation.lat},${nexterLocation.lng}`
          : ''
        const centerParam = !nexterLocation
          ? `&center=${order.food_maker.lat},${order.food_maker.lng}&zoom=15`
          : ''
        return `https://maps.googleapis.com/maps/api/staticmap?size=800x400&scale=2&maptype=roadmap&${makerMarker}${driverMarker}${centerParam}&key=${apiKey}`
      })()
    : null

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

  const addr = order.delivery_address as { street?: string; city?: string; state?: string }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Order Tracking" />

      {/* Map */}
      <div className="relative w-full h-52 bg-gradient-to-br from-blue-50 to-green-50 overflow-hidden">
        {mapUrl ? (
          <Image
            src={mapUrl}
            alt="Delivery map"
            fill
            className="object-cover"
            unoptimized
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
      </div>

      {/* Status Card */}
      <div className="bg-white mx-4 -mt-4 rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wide">
              {ORDER_STATUS_LABELS[currentStatus]}
            </p>
            <p className="font-bold text-gray-900 mt-0.5 text-base">
              {STATUS_MESSAGES[currentStatus] ?? 'Processing your order...'}
            </p>
          </div>
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1.5 rounded-xl">
              <Clock size={13} className="text-[#FF6B35]" />
              <span className="text-xs font-bold text-[#FF6B35]">Live</span>
            </div>
          )}
        </div>
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
          <h3 className="font-bold text-gray-900 mb-3 text-sm">
            Order from {order.food_maker.display_name}
          </h3>
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
            <div className="flex justify-between">
              <span>Service fee</span><span>${order.platform_fee.toFixed(2)}</span>
            </div>
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
      </div>

      {/* Review Modal */}
      {showReview && !reviewSubmitted && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReview(false)} />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <div className="text-center mb-6">
              <span className="text-5xl">🎉</span>
              <h2 className="text-xl font-black text-gray-900 mt-3">Order Delivered!</h2>
              <p className="text-gray-500 text-sm mt-1">
                How was {order.food_maker.display_name}?
              </p>
            </div>
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRating(i)} className="transition-transform active:scale-110">
                  <Star
                    size={36}
                    className={i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell others what you loved about this meal..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] transition-all mb-4"
              rows={3}
            />
            <Button fullWidth size="lg" loading={submittingReview} onClick={submitReview} disabled={rating === 0}>
              Submit Review
            </Button>
            <button onClick={() => { setShowReview(false); router.push('/orders') }} className="w-full text-center text-sm text-gray-400 mt-3">
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
