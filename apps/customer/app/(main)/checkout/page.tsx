'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock, Lock } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceDollars } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { DELIVERY_FEE, PLATFORM_FEE_PCT } from '@/lib/constants'
import type { Address } from '@/types'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const TIP_OPTIONS = [
  { label: 'No tip', value: 0 },
  { label: '10%', value: 0.1 },
  { label: '15%', value: 0.15 },
  { label: '20%', value: 0.2 },
]

interface CheckoutFormProps {
  orderId: string
  paymentIntentId: string
  total: number
  address: string
  setAddress: (v: string) => void
  selectedAddress: Address | null
  setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]
  tipPct: number
  setTipPct: (v: number) => void
  food: number
}

function CheckoutForm({
  orderId,
  paymentIntentId,
  total,
  address,
  setAddress,
  selectedAddress,
  setSelectedAddress,
  savedAddresses,
  tipPct,
  setTipPct,
  food,
}: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { makerName, items, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tipUpdating, setTipUpdating] = useState(false)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)
  const tipUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTipPct = useRef(tipPct)

  const platformFee = food * PLATFORM_FEE_PCT
  const tip = food * tipPct

  // Debounced tip update — updates PaymentIntent amount without recreating the order
  useEffect(() => {
    if (tipPct === prevTipPct.current) return
    prevTipPct.current = tipPct
    if (!paymentIntentId || !orderId) return

    if (tipUpdateRef.current) clearTimeout(tipUpdateRef.current)
    setTipUpdating(true)
    tipUpdateRef.current = setTimeout(async () => {
      try {
        await fetch('/api/update-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, orderId, tipPct, subtotal: food }),
        })
      } finally {
        setTipUpdating(false)
      }
    }, 600)
  }, [tipPct, paymentIntentId, orderId, food])

  const handleSelectSavedAddress = (addr: Address) => {
    setSelectedAddress(addr)
    setAddress(`${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`)
    setShowAddressInput(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (tipUpdating) { setError('Please wait — tip amount is still updating.'); return }
    setLoading(true)
    setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}` },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      const deliveryAddress = selectedAddress
        ? { street: selectedAddress.street, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip }
        : { street: address.trim(), city: '', state: '', zip: '' }

      const supabase = createClient()
      await supabase.from('orders').update({ delivery_address: deliveryAddress }).eq('id', orderId)
      clearCart()
      router.push(`/orders/${orderId}`)
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

          {/* Saved address quick-pick */}
          {savedAddresses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {savedAddresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => handleSelectSavedAddress(addr)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedAddress?.id === addr.id
                      ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#FF6B35]'
                  }`}
                >
                  <MapPin size={11} />
                  {addr.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setShowAddressInput(true); setSelectedAddress(null); setAddress('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  !selectedAddress && showAddressInput
                    ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#FF6B35]'
                }`}
              >
                + New
              </button>
            </div>
          )}

          {/* Address display or input */}
          {selectedAddress && !showAddressInput ? (
            <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl">
              <MapPin size={14} className="text-[#FF6B35] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{selectedAddress.street}</p>
                <p className="text-xs text-gray-500">{selectedAddress.city}, {selectedAddress.state} {selectedAddress.zip}</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddressInput(true); setSelectedAddress(null) }}
                className="text-[#FF6B35] text-xs font-semibold flex-shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <Input
              placeholder="Enter your full delivery address"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setSelectedAddress(null) }}
              autoComplete="street-address"
            />
          )}
        </div>

        {/* Delivery Time */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Delivery Time</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-3 bg-orange-50 rounded-xl">
            <Clock size={14} className="text-[#FF6B35]" />
            <span className="text-sm font-semibold text-gray-800">ASAP</span>
            <span className="text-xs text-gray-400 ml-1">— as fast as possible</span>
          </div>
        </div>

        {/* Tip */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900">Tip for your Nexter</h3>
            {tipUpdating && <span className="text-xs text-[#FF6B35] animate-pulse">Updating...</span>}
          </div>
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
                {value > 0 && <div className="text-xs opacity-70 mt-0.5">{formatPriceDollars(food * value)}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Payment */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Payment</h3>
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <Lock size={11} />
              Secured by Stripe
            </div>
          </div>
          <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
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
          {items.length > 3 && <p className="text-xs text-gray-400 mt-1">+{items.length - 3} more items</p>}
          <div className="h-px bg-gray-100 my-3" />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>{formatPriceDollars(food)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Delivery</span><span>{formatPriceDollars(DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Service fee</span><span>{formatPriceDollars(food * PLATFORM_FEE_PCT)}</span>
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

      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!stripe || tipUpdating}>
          Place Order · {formatPriceDollars(total)}
        </Button>
      </div>
    </form>
  )
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, makerId } = useCartStore()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [tipPct, setTipPct] = useState(0.15)
  const [initError, setInitError] = useState<string | null>(null)

  const food = subtotal()
  const platformFee = food * PLATFORM_FEE_PCT
  const tip = food * tipPct
  const total = food + DELIVERY_FEE + platformFee + tip

  // Load saved addresses and pre-select default
  useEffect(() => {
    async function loadAddresses() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [addrRes, profileRes] = await Promise.all([
        supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('users').select('default_address_id').eq('id', user.id).single(),
      ])
      const addrs: Address[] = addrRes.data || []
      setSavedAddresses(addrs)
      const defaultId = profileRes.data?.default_address_id
      const def = defaultId ? addrs.find((a) => a.id === defaultId) : addrs[0]
      if (def) {
        setSelectedAddress(def)
        setAddress(`${def.street}, ${def.city}, ${def.state} ${def.zip}`)
      }
    }
    loadAddresses()
  }, [])

  // Create payment intent once — tipPct deliberately excluded from deps to avoid duplicate orders
  const createIntent = useCallback(async () => {
    if (items.length === 0 || !makerId) return
    setInitError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            id: i.menu_item.id,
            price: i.menu_item.price,
            quantity: i.quantity,
            notes: i.notes,
          })),
          maker_id: makerId,
          delivery_address: null,
          tip_amount: food * 0.15, // created with default 15%; user can change after
        }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (data.error) { setInitError(data.error); return }
      setClientSecret(data.clientSecret)
      setOrderId(data.orderId)
      // Extract payment intent ID from client secret (format: pi_xxx_secret_yyy)
      if (data.clientSecret) {
        setPaymentIntentId(data.clientSecret.split('_secret_')[0])
      }
    } catch {
      setInitError('Failed to initialize payment. Please try again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, makerId, food, router])

  useEffect(() => { createIntent() }, [createIntent])

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Checkout" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-gray-400">Your cart is empty</p>
          <Button onClick={() => router.push('/')}>Browse Makers</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Checkout" />
      {initError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-gray-700 font-semibold">Payment initialization failed</p>
          <p className="text-gray-400 text-sm">{initError}</p>
          <Button onClick={createIntent}>Try Again</Button>
        </div>
      ) : clientSecret && orderId && paymentIntentId ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: { colorPrimary: '#FF6B35', borderRadius: '12px', fontFamily: 'inherit' },
            },
          }}
        >
          <CheckoutForm
            orderId={orderId}
            paymentIntentId={paymentIntentId}
            total={total}
            address={address}
            setAddress={setAddress}
            selectedAddress={selectedAddress}
            setSelectedAddress={setSelectedAddress}
            savedAddresses={savedAddresses}
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
