'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock, Lock } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceDollars } from '@/lib/utils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const DELIVERY_FEE = 3.99
const PLATFORM_FEE_PCT = 0.05

const TIP_OPTIONS = [
  { label: 'No tip', value: 0 },
  { label: '10%', value: 0.1 },
  { label: '15%', value: 0.15 },
  { label: '20%', value: 0.2 },
]

function CheckoutForm({
  clientSecret,
  total,
  address,
  setAddress,
  tipPct,
  setTipPct,
  food,
}: {
  clientSecret: string
  total: number
  address: string
  setAddress: (v: string) => void
  tipPct: number
  setTipPct: (v: number) => void
  food: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { makerName, items, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const platformFee = food * PLATFORM_FEE_PCT
  const tip = food * tipPct

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!address.trim()) {
      setError('Please enter your delivery address')
      return
    }
    setLoading(true)
    setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '/orders' },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      clearCart()
      router.push(`/orders`)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
      <div className="flex-1 overflow-y-auto space-y-3 py-3">
        {/* Delivery Address */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Delivery Address</h3>
          </div>
          <Input
            placeholder="Enter your full delivery address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
          />
        </div>

        {/* Delivery Time */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Delivery Time</h3>
          </div>
          <div className="flex gap-2">
            {['ASAP', 'Schedule'].map((opt) => (
              <button
                type="button"
                key={opt}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                  opt === 'ASAP'
                    ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div className="bg-white px-4 py-4">
          <h3 className="font-bold text-gray-900 mb-1">Tip for your Nexter</h3>
          <p className="text-xs text-gray-400 mb-3">100% goes to your delivery driver</p>
          <div className="flex gap-2">
            {TIP_OPTIONS.map(({ label, value }) => (
              <button
                type="button"
                key={label}
                onClick={() => setTipPct(value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  tipPct === value
                    ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {label}
                {value > 0 && (
                  <div className="text-xs opacity-70 mt-0.5">
                    {formatPriceDollars(food * value)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Payment — Stripe Elements */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Payment</h3>
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <Lock size={11} />
              Secured by Stripe
            </div>
          </div>
          <PaymentElement
            options={{
              layout: 'tabs',
              wallets: { applePay: 'auto', googlePay: 'auto' },
            }}
          />
          {error && (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Order Summary */}
        <div className="bg-white px-4 py-4">
          <h3 className="font-bold text-gray-900 mb-3">
            Order from <span className="text-[#FF6B35]">{makerName}</span>
          </h3>
          {items.slice(0, 3).map(({ menu_item, quantity }) => (
            <div key={menu_item.id} className="flex justify-between text-sm text-gray-600 py-1">
              <span>{quantity}x {menu_item.name}</span>
              <span>{formatPriceDollars(menu_item.price * quantity)}</span>
            </div>
          ))}
          {items.length > 3 && (
            <p className="text-xs text-gray-400 mt-1">+{items.length - 3} more items</p>
          )}
          <div className="h-px bg-gray-100 my-3" />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>{formatPriceDollars(food)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Delivery</span><span>{formatPriceDollars(DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Service fee</span><span>{formatPriceDollars(platformFee)}</span>
            </div>
            {tip > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tip</span><span>{formatPriceDollars(tip)}</span>
              </div>
            )}
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span><span>{formatPriceDollars(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Place Order */}
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!stripe}>
          Place Order · {formatPriceDollars(total)}
        </Button>
      </div>
    </form>
  )
}

export default function CheckoutPage() {
  const { items, subtotal } = useCartStore()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [tipPct, setTipPct] = useState(0.15)

  const food = subtotal()
  const platformFee = food * PLATFORM_FEE_PCT
  const tip = food * tipPct
  const total = food + DELIVERY_FEE + platformFee + tip

  const createIntent = useCallback(async () => {
    if (items.length === 0) return
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((i) => ({ price: i.menu_item.price, quantity: i.quantity })),
        delivery_fee: DELIVERY_FEE,
        tip_amount: food * tipPct,
      }),
    })
    const data = await res.json()
    if (data.clientSecret) setClientSecret(data.clientSecret)
  }, [items, food, tipPct])

  useEffect(() => {
    createIntent()
  }, [createIntent])

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Checkout" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">Your cart is empty</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Checkout" />
      {clientSecret ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#FF6B35',
                borderRadius: '12px',
                fontFamily: 'inherit',
              },
            },
          }}
        >
          <CheckoutForm
            clientSecret={clientSecret}
            total={total}
            address={address}
            setAddress={setAddress}
            tipPct={tipPct}
            setTipPct={setTipPct}
            food={food}
          />
        </Elements>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
