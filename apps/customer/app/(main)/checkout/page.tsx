'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock, Lock, Banknote } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { formatPriceDollars } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { DELIVERY_FEE, PLATFORM_FEE_PCT } from '@/lib/constants'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'
import type { Address } from '@/types'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

const TIP_OPTIONS = [
  { label: 'No tip', value: 0 },
  { label: '10%', value: 0.1 },
  { label: '15%', value: 0.15 },
  { label: '20%', value: 0.2 },
]

type PaymentMethod = 'card' | 'cash'

/* ── shared address / tip / summary UI ── */
function AddressSection({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, showAddressInput, setShowAddressInput, onAddressSaved,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; showAddressInput: boolean; setShowAddressInput: (v: boolean) => void
  onAddressSaved: (addr: Address) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onAddressSavedRef = useRef(onAddressSaved)
  onAddressSavedRef.current = onAddressSaved
  const [saving, setSaving] = useState(false)

  const handleSelect = (addr: Address) => {
    setSelectedAddress(addr)
    setAddress(`${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`)
    setShowAddressInput(false)
  }

  // Attach Google Places autocomplete when the new-address input is visible
  useEffect(() => {
    if (!showAddressInput) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return

    let ac: google.maps.places.Autocomplete | null = null

    loadGoogleMapsScript(apiKey).then(() => {
      if (!inputRef.current) return
      ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        fields: ['address_components', 'geometry'],
      })
      ac.addListener('place_changed', async () => {
        const parsed = parsePlace(ac!.getPlace())
        if (!parsed) return
        setAddress(`${parsed.street}, ${parsed.city}, ${parsed.state} ${parsed.zip}`)
        setSaving(true)
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: newAddr, error } = await supabase
              .from('addresses')
              .insert({ user_id: user.id, label: 'Other', ...parsed })
              .select()
              .single()
            if (newAddr && !error) {
              onAddressSavedRef.current(newAddr as Address)
              handleSelect(newAddr as Address)
            }
          }
        } finally {
          setSaving(false)
        }
      })
    })

    return () => {
      if (ac) window.google?.maps?.event?.clearInstanceListeners(ac)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddressInput])

  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={18} className="text-[#FF6B35]" />
        <h3 className="font-bold text-gray-900">Delivery Address</h3>
      </div>
      {savedAddresses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {savedAddresses.map((addr) => (
            <button
              key={addr.id} type="button" onClick={() => handleSelect(addr)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedAddress?.id === addr.id
                  ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#FF6B35]'
              }`}
            >
              <MapPin size={11} />{addr.label}
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
          >+ New</button>
        </div>
      )}
      {selectedAddress && !showAddressInput ? (
        <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl">
          <MapPin size={14} className="text-[#FF6B35] mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{selectedAddress.street}</p>
            <p className="text-xs text-gray-500">{selectedAddress.city}, {selectedAddress.state} {selectedAddress.zip}</p>
          </div>
          <button type="button" onClick={() => { setShowAddressInput(true); setSelectedAddress(null) }}
            className="text-[#FF6B35] text-xs font-semibold flex-shrink-0">Change</button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            placeholder="Start typing your address..."
            value={address}
            onChange={(e) => { setAddress(e.target.value); setSelectedAddress(null) }}
            autoComplete="off"
            className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors"
          />
          {saving && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OrderSummary({ makerName, items, food, deliveryFee, tip, total, platformFee }: {
  makerName: string; items: ReturnType<typeof useCartStore>['items']
  food: number; deliveryFee: number; tip: number; total: number; platformFee: number
}) {
  return (
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
        <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatPriceDollars(food)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Delivery</span><span>{formatPriceDollars(deliveryFee)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Service fee</span><span>{formatPriceDollars(platformFee)}</span></div>
        {tip > 0 && <div className="flex justify-between text-gray-500"><span>Tip</span><span>{formatPriceDollars(tip)}</span></div>}
        <div className="h-px bg-gray-100 my-1" />
        <div className="flex justify-between font-bold text-gray-900 text-base"><span>Total</span><span>{formatPriceDollars(total)}</span></div>
      </div>
    </div>
  )
}

/* ── Card checkout form (Stripe) ── */
function CardCheckoutForm({
  orderId, paymentIntentId, total, address, setAddress,
  selectedAddress, setSelectedAddress, savedAddresses, onAddressSaved,
  tipPct, setTipPct, food, deliveryFee,
}: {
  orderId: string; paymentIntentId: string; total: number
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  tipPct: number; setTipPct: (v: number) => void
  food: number; deliveryFee: number
}) {
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

  useEffect(() => {
    if (tipPct === prevTipPct.current) return
    prevTipPct.current = tipPct
    if (!paymentIntentId || !orderId) return
    if (tipUpdateRef.current) clearTimeout(tipUpdateRef.current)
    setTipUpdating(true)
    tipUpdateRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/update-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, orderId, tipPct, subtotal: food }),
        })
        if (!res.ok) setError('Failed to update tip amount. Please try again.')
      } catch {
        setError('Failed to update tip amount. Please try again.')
      } finally { setTipUpdating(false) }
    }, 600)
  }, [tipPct, paymentIntentId, orderId, food])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (tipUpdating) { setError('Please wait — tip amount is still updating.'); return }
    setLoading(true); setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}` },
      redirect: 'if_required',
    })

    if (stripeError) { setError(stripeError.message ?? 'Payment failed. Please try again.'); setLoading(false); return }

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
        <AddressSection
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses} showAddressInput={showAddressInput}
          setShowAddressInput={setShowAddressInput} onAddressSaved={onAddressSaved}
        />
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
        <div className="bg-white px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900">Tip for your Nexter</h3>
            {tipUpdating && <span className="text-xs text-[#FF6B35] animate-pulse">Updating...</span>}
          </div>
          <p className="text-xs text-gray-400 mb-3">100% goes to your delivery driver</p>
          <div className="flex gap-2">
            {TIP_OPTIONS.map(({ label, value }) => (
              <button type="button" key={label} onClick={() => setTipPct(value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  tipPct === value ? 'bg-[#FF6B35] text-white border-[#FF6B35]' : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {label}
                {value > 0 && <div className="text-xs opacity-70 mt-0.5">{formatPriceDollars(food * value)}</div>}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Payment</h3>
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <Lock size={11} />Secured by Stripe
            </div>
          </div>
          <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
        <OrderSummary
          makerName={makerName} items={items} food={food}
          deliveryFee={deliveryFee} tip={tip} total={total} platformFee={platformFee}
        />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!stripe || tipUpdating}>
          Place Order · {formatPriceDollars(total)}
        </Button>
      </div>
    </form>
  )
}

/* ── Cash checkout form ── */
function CashCheckoutForm({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved, food, total, deliveryFee, makerId, onSuccess,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  food: number; total: number; deliveryFee: number
  makerId: string; onSuccess: (orderId: string) => void
}) {
  const { items, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)
  const platformFee = food * PLATFORM_FEE_PCT

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    setLoading(true); setError(null)

    const deliveryAddress = selectedAddress
      ? { street: selectedAddress.street, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip }
      : { street: address.trim(), city: '', state: '', zip: '' }

    try {
      const res = await fetch('/api/checkout-cash', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.menu_item.id, quantity: i.quantity, notes: i.notes })),
          maker_id: makerId,
          delivery_address: deliveryAddress,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? 'Failed to place order. Please try again.'); return }
      clearCart()
      onSuccess(data.orderId)
    } catch {
      setError('Failed to place order. Please try again.')
    } finally { setLoading(false) }
  }

  const { makerName } = useCartStore()

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
      <div className="flex-1 overflow-y-auto space-y-3 py-3">
        <AddressSection
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses} showAddressInput={showAddressInput}
          setShowAddressInput={setShowAddressInput} onAddressSaved={onAddressSaved}
        />
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
        {/* Cash payment notice */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Banknote size={18} className="text-green-600" />
            <h3 className="font-bold text-gray-900">Cash on Delivery</h3>
          </div>
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
            <Banknote size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Pay with cash</p>
              <p className="text-xs text-green-700 mt-0.5">
                Please have exact change ready when your order arrives.
                Your driver will collect <span className="font-bold">{formatPriceDollars(total)}</span> on delivery.
              </p>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
        <OrderSummary
          makerName={makerName} items={items} food={food}
          deliveryFee={deliveryFee} tip={0} total={total} platformFee={platformFee}
        />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Place Cash Order · {formatPriceDollars(total)}
        </Button>
      </div>
    </form>
  )
}

/* ── Main page ── */
export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, makerId } = useCartStore()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
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
  const cardTotal = food + DELIVERY_FEE + platformFee + tip
  const cashTotal = food + DELIVERY_FEE + platformFee

  // Load saved addresses
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

  // Create Stripe PaymentIntent (card only)
  const createCardIntent = useCallback(async () => {
    if (items.length === 0 || !makerId || paymentMethod !== 'card') return
    setInitError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.menu_item.id, price: i.menu_item.price, quantity: i.quantity, notes: i.notes })),
          maker_id: makerId,
          delivery_address: null,
          tip_amount: food * 0.15,
        }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (data.error) { setInitError(data.error); return }
      setClientSecret(data.clientSecret)
      setOrderId(data.orderId)
      if (data.clientSecret) setPaymentIntentId(data.clientSecret.split('_secret_')[0])
    } catch {
      setInitError('Failed to initialize payment. Please try again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, makerId, food, router, paymentMethod])

  useEffect(() => {
    if (paymentMethod === 'card' && !clientSecret) createCardIntent()
  }, [paymentMethod, clientSecret, createCardIntent])

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

      {/* Payment method toggle */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Payment Method</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod('card')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
              paymentMethod === 'card'
                ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                : 'border-gray-100 text-gray-500 bg-gray-50'
            }`}
          >
            <CreditCard size={16} />Card / Wallet
          </button>
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
              paymentMethod === 'cash'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-100 text-gray-500 bg-gray-50'
            }`}
          >
            <Banknote size={16} />Cash
          </button>
        </div>
      </div>

      {paymentMethod === 'cash' ? (
        <CashCheckoutForm
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses}
          onAddressSaved={(addr) => setSavedAddresses((prev) => [...prev, addr])}
          food={food} total={cashTotal} deliveryFee={DELIVERY_FEE}
          makerId={makerId ?? ''}
          onSuccess={(id) => router.push(`/orders/${id}`)}
        />
      ) : initError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-gray-700 font-semibold">Payment initialization failed</p>
          <p className="text-gray-400 text-sm">{initError}</p>
          <Button onClick={createCardIntent}>Try Again</Button>
        </div>
      ) : clientSecret && orderId && paymentIntentId ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: { theme: 'stripe', variables: { colorPrimary: '#FF6B35', borderRadius: '12px', fontFamily: 'inherit' } },
          }}
        >
          <CardCheckoutForm
            orderId={orderId} paymentIntentId={paymentIntentId}
            total={cardTotal} address={address} setAddress={setAddress}
            selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
            savedAddresses={savedAddresses}
            onAddressSaved={(addr) => setSavedAddresses((prev) => [...prev, addr])}
            tipPct={tipPct} setTipPct={setTipPct}
            food={food} deliveryFee={DELIVERY_FEE}
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
