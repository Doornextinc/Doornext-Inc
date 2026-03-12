'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle, Circle, Clock, MapPin, MessageCircle, Phone, Star } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { cn, ORDER_STATUS_LABELS } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const STATUS_STEPS: OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'on_the_way',
  'delivered',
]

// Mock order data
const MOCK_ORDER = {
  id: 'order_demo',
  maker_name: "Mama Adaeze's Kitchen",
  nexter_name: 'James O.',
  nexter_phone: '+1 (555) 234-5678',
  items: [
    { name: 'Jollof Rice + Chicken', quantity: 2, price: 18.0 },
    { name: 'Puff Puff (6 pcs)', quantity: 1, price: 6.0 },
  ],
  subtotal: 42.0,
  delivery_fee: 3.99,
  tip: 6.3,
  total: 53.56,
  delivery_address: '123 Main St, Brooklyn, NY 11201',
  estimated_delivery: '7:45 PM',
}

const STATUS_MESSAGES: Record<OrderStatus, string> = {
  pending: 'Waiting for confirmation...',
  confirmed: 'Your order has been confirmed!',
  preparing: "Mama Adaeze is cooking your food 🍲",
  ready: 'Your order is ready for pickup!',
  picked_up: 'James picked up your order!',
  on_the_way: "James is on the way 🛵",
  delivered: 'Delivered! Enjoy your meal 🎉',
  cancelled: 'Order was cancelled',
}

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<OrderStatus>('confirmed')
  const [showReview, setShowReview] = useState(false)
  const [rating, setRating] = useState(0)

  // Simulate order progress for demo
  useEffect(() => {
    const steps: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered']
    let i = 0
    const interval = setInterval(() => {
      i++
      if (i < steps.length) {
        setStatus(steps[i])
      } else {
        clearInterval(interval)
        setTimeout(() => setShowReview(true), 1000)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const currentStep = STATUS_STEPS.indexOf(status)
  const isDelivered = status === 'delivered'

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Order Tracking" />

      {/* Map placeholder */}
      <div className="relative w-full h-52 bg-gradient-to-br from-blue-50 to-green-50 overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative">
            {/* Animated delivery dot */}
            <div className="w-8 h-8 bg-[#FF6B35] rounded-full flex items-center justify-center shadow-lg shadow-orange-300 animate-bounce">
              <span className="text-white text-sm">🛵</span>
            </div>
            <div className="absolute -inset-2 bg-[#FF6B35]/20 rounded-full animate-ping" />
          </div>
          <p className="text-gray-400 text-xs mt-4 font-medium">Live tracking map</p>
          <p className="text-gray-300 text-xs">(Google Maps will appear here)</p>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white mx-4 -mt-4 rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wide">
              {ORDER_STATUS_LABELS[status]}
            </p>
            <p className="font-bold text-gray-900 mt-0.5 text-base">
              {STATUS_MESSAGES[status]}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1.5 rounded-xl">
            <Clock size={13} className="text-[#FF6B35]" />
            <span className="text-xs font-bold text-[#FF6B35]">
              {MOCK_ORDER.estimated_delivery}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Progress Steps */}
        <div className="bg-white rounded-2xl p-4">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Order Progress</h3>
          <div className="space-y-0">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = i <= currentStep
              const isCurrent = i === currentStep
              const isLast = i === STATUS_STEPS.length - 1
              return (
                <div key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                        isCompleted
                          ? 'bg-[#FF6B35] text-white'
                          : 'bg-gray-100 text-gray-300'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle size={14} />
                      ) : (
                        <Circle size={14} />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={cn(
                          'w-0.5 h-8 mt-1',
                          i < currentStep ? 'bg-[#FF6B35]' : 'bg-gray-100'
                        )}
                      />
                    )}
                  </div>
                  <div className="pb-8 last:pb-0">
                    <p
                      className={cn(
                        'text-sm font-semibold leading-tight',
                        isCurrent
                          ? 'text-[#FF6B35]'
                          : isCompleted
                          ? 'text-gray-700'
                          : 'text-gray-300'
                      )}
                    >
                      {ORDER_STATUS_LABELS[step]}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-gray-400 mt-0.5">In progress...</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Driver Info */}
        {(status === 'picked_up' || status === 'on_the_way' || status === 'delivered') && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Your Nexter</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center">
                  <span className="text-white font-bold">J</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{MOCK_ORDER.nexter_name}</p>
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-gray-500">4.95 · 312 deliveries</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <MessageCircle size={18} className="text-gray-600" />
                </button>
                <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Phone size={18} className="text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Address */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900 text-sm">Delivering to</h3>
          </div>
          <p className="text-sm text-gray-600">{MOCK_ORDER.delivery_address}</p>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl p-4">
          <h3 className="font-bold text-gray-900 mb-3 text-sm">
            Order from {MOCK_ORDER.maker_name}
          </h3>
          {MOCK_ORDER.items.map((item) => (
            <div key={item.name} className="flex justify-between text-sm py-1.5 text-gray-600">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="h-px bg-gray-100 my-2" />
          <div className="flex justify-between font-bold text-gray-900 text-sm">
            <span>Total paid</span>
            <span>${MOCK_ORDER.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowReview(false)}
          />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            <div className="text-center mb-6">
              <span className="text-5xl">🎉</span>
              <h2 className="text-xl font-black text-gray-900 mt-3">
                Order Delivered!
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                How was {MOCK_ORDER.maker_name}?
              </p>
            </div>
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  onClick={() => setRating(i)}
                  className="transition-transform active:scale-110"
                >
                  <Star
                    size={36}
                    className={
                      i <= rating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-200 fill-gray-200'
                    }
                  />
                </button>
              ))}
            </div>
            <textarea
              placeholder="Tell others what you loved about this meal..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] transition-all mb-4"
              rows={3}
            />
            <Button
              fullWidth
              size="lg"
              onClick={() => {
                setShowReview(false)
                router.push('/orders')
              }}
              disabled={rating === 0}
            >
              Submit Review
            </Button>
            <button
              onClick={() => setShowReview(false)}
              className="w-full text-center text-sm text-gray-400 mt-3"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
