'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock, Lock, Banknote, Loader2, MessageSquare } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { formatPriceDollars } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_FEE_PCT } from '@/lib/constants'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'
import type { Address, CartItem } from '@/types'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

type PaymentMethod = 'card' | 'cash'

type FeeEstimate = {
  delivery_fee: number
  service_fee: number
  small_order_fee: number
  surge_fee: number
  total: number
  distance_miles: number
}

/** Haversine distance in miles between two lat/lng points */
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ── shared address UI ── */
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

/* ── drop-off instructions ── */
const DROPOFF_OPTIONS = [
  { id: 'leave_door',      emoji: '🚪', label: 'Leave at door' },
  { id: 'hand_to_me',      emoji: '🤝', label: 'Hand to me' },
  { id: 'doorman',         emoji: '🏢', label: 'Leave with doorman' },
  { id: 'ring_bell',       emoji: '🔔', label: 'Ring bell / knock' },
  { id: 'neighbor',        emoji: '👥', label: 'Leave with neighbor' },
  { id: 'other',           emoji: '✏️', label: 'Other' },
] as const

type DropoffOptionId = typeof DROPOFF_OPTIONS[number]['id']

function DropoffNoteSection({ note, setNote }: { note: string; setNote: (v: string) => void }) {
  // Track which preset is selected and any extra detail text separately,
  // composing them into the parent `note` string on every change.
  const [selected, setSelected] = useState<DropoffOptionId | null>(null)
  const [details, setDetails] = useState('')

  const compose = (opt: DropoffOptionId | null, det: string) => {
    if (!opt) { setNote(''); return }
    if (opt === 'other') {
      setNote(det.trim())
    } else {
      const label = DROPOFF_OPTIONS.find(o => o.id === opt)!.label
      setNote(det.trim() ? `${label} — ${det.trim()}` : label)
    }
  }

  const handleSelect = (id: DropoffOptionId) => {
    setSelected(id)
    compose(id, details)
  }

  const handleDetails = (val: string) => {
    if (val.length > 200) return
    setDetails(val)
    compose(selected, val)
  }

  const nothingSelected = !selected
  const otherMissingText = selected === 'other' && details.trim().length === 0

  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={18} className="text-[#FF6B35]" />
        <h3 className="font-bold text-gray-900">
          Drop-off Instructions
          <span className="text-red-500 ml-0.5">*</span>
        </h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">How should the driver handle your order?</p>

      {/* Option grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {DROPOFF_OPTIONS.map((opt) => {
          const active = selected === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 text-left transition-colors ${
                active
                  ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="text-lg leading-none">{opt.emoji}</span>
              <span className={`text-xs font-semibold leading-tight ${active ? 'text-[#FF6B35]' : 'text-gray-700'}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Extra details / Other textarea */}
      {selected && (
        <div>
          <textarea
            value={details}
            onChange={(e) => handleDetails(e.target.value)}
            placeholder={
              selected === 'other'
                ? 'Describe where to leave your order…'
                : 'Add details — apt number, gate code, floor, etc. (optional)'
            }
            rows={2}
            className={`w-full border-2 rounded-xl px-3.5 py-3 text-sm outline-none transition-colors resize-none ${
              otherMissingText
                ? 'border-red-200 focus:border-red-400 bg-red-50/30'
                : 'border-gray-100 focus:border-[#FF6B35]'
            }`}
          />
          <div className="flex items-center justify-between mt-1">
            {otherMissingText ? (
              <p className="text-xs text-red-400 font-medium">Please describe where to leave your order</p>
            ) : (
              <span />
            )}
            <span className={`text-xs ml-auto ${details.length > 180 ? 'text-red-400' : 'text-gray-300'}`}>
              {details.length}/200
            </span>
          </div>
        </div>
      )}

      {nothingSelected && (
        <p className="text-xs text-red-400 font-medium mt-1">Required — select a drop-off option</p>
      )}
    </div>
  )
}

function OrderSummary({ makerName, items, food, estimate, estimating }: {
  makerName: string | null; items: CartItem[]
  food: number; estimate: FeeEstimate | null; estimating: boolean
}) {
  const platformFee = food * PLATFORM_FEE_PCT
  const deliveryFee = estimate?.delivery_fee ?? null
  const serviceFee  = estimate?.service_fee  ?? platformFee
  const total       = estimate?.total        ?? (food + serviceFee)

  return (
    <div className="bg-white px-4 py-4">
      <h3 className="font-bold text-gray-900 mb-3">
        Order from <span className="text-[#FF6B35]">{makerName ?? 'Unknown Kitchen'}</span>
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
        <div className="flex justify-between text-gray-500">
          <span>Delivery</span>
          {estimating ? (
            <span className="flex items-center gap-1 text-gray-400"><Loader2 size={12} className="animate-spin" />Calculating…</span>
          ) : deliveryFee !== null ? (
            <span>{formatPriceDollars(deliveryFee)}</span>
          ) : (
            <span className="text-gray-400 text-xs">Enter address</span>
          )}
        </div>
        {estimate?.small_order_fee ? (
          <div className="flex justify-between text-gray-500"><span>Small order fee</span><span>{formatPriceDollars(estimate.small_order_fee)}</span></div>
        ) : null}
        {estimate?.surge_fee ? (
          <div className="flex justify-between text-amber-600"><span>Surge fee</span><span>{formatPriceDollars(estimate.surge_fee)}</span></div>
        ) : null}
        <div className="flex justify-between text-gray-500"><span>Service fee</span><span>{formatPriceDollars(serviceFee)}</span></div>
        <div className="h-px bg-gray-100 my-1" />
        <div className="flex justify-between font-bold text-gray-900 text-base">
          <span>Total</span>
          {estimating ? (
            <span className="flex items-center gap-1 text-gray-400"><Loader2 size={13} className="animate-spin" /></span>
          ) : (
            <span>{formatPriceDollars(total)}</span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">You can tip your driver after delivery</p>
    </div>
  )
}

/**
 * Shell shown while we wait for the address (no estimate yet) or while the
 * PaymentIntent is initialising after an estimate arrives.  No Stripe elements.
 */
function CardAddressShell({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved, items, food, makerName,
  estimate, estimating, dropoffNote, setDropoffNote,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  items: CartItem[]; food: number; makerName: string | null
  estimate: FeeEstimate | null; estimating: boolean
  dropoffNote: string; setDropoffNote: (v: string) => void
}) {
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0 || !selectedAddress)

  // True once we have estimate + no error — means PaymentIntent is being created
  const waitingForIntent = !!selectedAddress && !!estimate && !estimating

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 overflow-y-auto space-y-3 py-3">
        <AddressSection
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses} showAddressInput={showAddressInput}
          setShowAddressInput={setShowAddressInput} onAddressSaved={onAddressSaved}
        />
        <DropoffNoteSection note={dropoffNote} setNote={setDropoffNote} />
        <OrderSummary makerName={makerName} items={items} food={food} estimate={estimate} estimating={estimating} />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button fullWidth size="lg" disabled>
          {waitingForIntent
            ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Preparing payment…</span>
            : estimating
            ? 'Calculating delivery fee…'
            : 'Enter delivery address to continue'}
        </Button>
      </div>
    </div>
  )
}

/* ── Card checkout form ── */
function CardCheckoutForm({
  address, setAddress,
  selectedAddress, setSelectedAddress, savedAddresses, onAddressSaved,
  food, estimate, estimating, orderId, dropoffNote, setDropoffNote,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  food: number; estimate: FeeEstimate | null; estimating: boolean
  orderId: string
  dropoffNote: string; setDropoffNote: (v: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { makerName, items, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)

  const canPlace = !!selectedAddress && !!estimate && !estimating && dropoffNote.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (!dropoffNote.trim()) { setError('Drop-off instructions are required'); return }
    if (!estimate) { setError('Waiting for delivery fee calculation…'); return }
    setLoading(true); setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders` },
      redirect: 'if_required',
    })

    if (stripeError) { setError(stripeError.message ?? 'Payment failed. Please try again.'); setLoading(false); return }

    if (paymentIntent?.status === 'succeeded') {
      const deliveryAddress = selectedAddress
        ? { street: selectedAddress.street, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip, lat: selectedAddress.lat, lng: selectedAddress.lng }
        : { street: address.trim(), city: '', state: '', zip: '' }
      const supabase = createClient()
      // Persist address + drop-off note now that payment is confirmed
      await supabase.from('orders')
        .update({ delivery_address: deliveryAddress, dropoff_note: dropoffNote.trim() })
        .eq('id', orderId)
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
        <DropoffNoteSection note={dropoffNote} setNote={setDropoffNote} />
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
        <div className="bg-white px-4 py-4" id="card-payment-section">
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
        <OrderSummary makerName={makerName} items={items} food={food} estimate={estimate} estimating={estimating} />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!stripe || !canPlace}>
          {canPlace
            ? `Place Order · ${formatPriceDollars(estimate.total)}`
            : estimating
            ? 'Calculating fee…'
            : 'Enter delivery address to continue'}
        </Button>
      </div>
    </form>
  )
}

/* ── Cash checkout form ── */
function CashCheckoutForm({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved, food, estimate, estimating, makerId, onSuccess,
  dropoffNote, setDropoffNote,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  food: number; estimate: FeeEstimate | null; estimating: boolean
  makerId: string; onSuccess: (orderId: string) => void
  dropoffNote: string; setDropoffNote: (v: string) => void
}) {
  const { items, makerName, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)

  const canPlace = !!selectedAddress && !!estimate && !estimating && dropoffNote.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (!dropoffNote.trim()) { setError('Drop-off instructions are required'); return }
    if (!estimate) { setError('Waiting for delivery fee calculation…'); return }
    setLoading(true)
    setError(null)

    const deliveryAddress = selectedAddress
      ? { street: selectedAddress.street, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip, lat: selectedAddress.lat, lng: selectedAddress.lng }
      : { street: address.trim(), city: '', state: '', zip: '' }

    try {
      const res = await fetch('/api/checkout-cash', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.menu_item.id, quantity: i.quantity, notes: i.notes })),
          maker_id: makerId,
          delivery_address: deliveryAddress,
          distance_miles: estimate.distance_miles,
          dropoff_note: dropoffNote.trim(),
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
      <div className="flex-1 overflow-y-auto space-y-3 py-3">
        <AddressSection
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses} showAddressInput={showAddressInput}
          setShowAddressInput={setShowAddressInput} onAddressSaved={onAddressSaved}
        />
        <DropoffNoteSection note={dropoffNote} setNote={setDropoffNote} />
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
                {estimate && !estimating && (
                  <> Your driver will collect <span className="font-bold">{formatPriceDollars(estimate.total)}</span> on delivery.</>
                )}
              </p>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
        <OrderSummary makerName={makerName} items={items} food={food} estimate={estimate} estimating={estimating} />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!canPlace}>
          {canPlace
            ? `Place Cash Order · ${formatPriceDollars(estimate.total)}`
            : estimating
            ? 'Calculating fee…'
            : 'Enter delivery address to continue'}
        </Button>
      </div>
    </form>
  )
}

/* ── Main page ── */
export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, makerId, makerName } = useCartStore()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [dropoffNote, setDropoffNote] = useState('')
  const [initError, setInitError] = useState<string | null>(null)

  // Maker location — fetched on mount to compute distance when address is selected
  const [makerLat, setMakerLat] = useState<number | null>(null)
  const [makerLng, setMakerLng] = useState<number | null>(null)

  // Real fee estimate — null until address is selected and API responds
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)

  const food = subtotal()

  // Load saved addresses + maker lat/lng
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [addrRes, profileRes, makerRes] = await Promise.all([
        supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('users').select('default_address_id').eq('id', user.id).single(),
        makerId
          ? supabase.from('food_makers').select('lat, lng').eq('id', makerId).single()
          : Promise.resolve({ data: null }),
      ])

      const addrs: Address[] = addrRes.data || []
      setSavedAddresses(addrs)

      if (makerRes.data) {
        setMakerLat(makerRes.data.lat)
        setMakerLng(makerRes.data.lng)
      }

      const defaultId = profileRes.data?.default_address_id
      const def = defaultId ? addrs.find((a) => a.id === defaultId) : addrs[0]
      if (def) {
        setSelectedAddress(def)
        setAddress(`${def.street}, ${def.city}, ${def.state} ${def.zip}`)
      }
    }
    load()
  }, [makerId])

  // Fetch real fee estimate whenever address or maker location changes.
  // We always attempt the fetch — if either set of coords is missing or 0,0 we
  // fall back to distance_miles: 0 so the base-tier fee is shown rather than
  // blocking the user entirely (common when a maker has no coords in the DB yet,
  // or when the saved address was geocoded to 0,0 by mistake).
  const fetchEstimate = useCallback(async (addr: Address) => {
    if (!makerId) return

    // Treat 0,0 as "no real coordinate" — it's the DB default, not a valid location.
    const addrValid  = addr.lat  != null && addr.lng  != null && !(addr.lat  === 0 && addr.lng  === 0)
    const makerValid = makerLat  != null && makerLng  != null && !(makerLat  === 0 && makerLng  === 0)
    const distance   = addrValid && makerValid
      ? haversineMiles(makerLat!, makerLng!, addr.lat, addr.lng)
      : 0

    setEstimating(true)
    try {
      const res = await fetch('/api/checkout/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maker_id: makerId, subtotal: food, distance_miles: distance }),
      })
      const data = await res.json()
      if (res.ok) setEstimate(data as FeeEstimate)
    } catch { /* non-blocking */ } finally {
      setEstimating(false)
    }
  }, [makerId, food, makerLat, makerLng])

  useEffect(() => {
    // Fire as soon as an address is selected — don't gate on makerLat/makerLng
    // being non-null because 0,0 was a valid falsy value that blocked the fetch.
    // fetchEstimate itself handles missing/zero coords gracefully with a fallback.
    if (selectedAddress) {
      setEstimate(null)
      setClientSecret(null)
      setOrderId(null)
      fetchEstimate(selectedAddress)
    }
  }, [selectedAddress, makerLat, makerLng, fetchEstimate])

  // Create PaymentIntent only once we have a real estimate (card only)
  const createCardIntent = useCallback(async () => {
    if (!estimate || !makerId || paymentMethod !== 'card') return
    setInitError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.menu_item.id, price: i.menu_item.price, quantity: i.quantity, notes: i.notes })),
          maker_id: makerId,
          delivery_address: null, // will be saved after payment confirmation
          distance_miles: estimate.distance_miles,
        }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (data.error) { setInitError(data.error); return }
      setClientSecret(data.clientSecret)
      setOrderId(data.orderId)
    } catch {
      setInitError('Failed to initialize payment. Please try again.')
    }
  }, [estimate, makerId, paymentMethod, items, router])

  // Trigger PaymentIntent creation once estimate is ready (card only)
  useEffect(() => {
    if (estimate && paymentMethod === 'card' && !clientSecret) {
      createCardIntent()
    }
  }, [estimate, paymentMethod, clientSecret, createCardIntent])

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
            onClick={() => { setPaymentMethod('card'); setClientSecret(null); setOrderId(null) }}
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
          food={food} estimate={estimate} estimating={estimating}
          makerId={makerId ?? ''}
          onSuccess={(id) => router.push(`/orders/${id}`)}
          dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
        />
      ) : initError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-gray-700 font-semibold">Payment initialization failed</p>
          <p className="text-gray-400 text-sm">{initError}</p>
          <Button onClick={createCardIntent}>Try Again</Button>
        </div>
      ) : clientSecret && orderId ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: { theme: 'stripe', variables: { colorPrimary: '#FF6B35', borderRadius: '12px', fontFamily: 'inherit' } },
          }}
        >
          <CardCheckoutForm
            address={address} setAddress={setAddress}
            selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
            savedAddresses={savedAddresses}
            onAddressSaved={(addr) => setSavedAddresses((prev) => [...prev, addr])}
            food={food} estimate={estimate} estimating={estimating}
            orderId={orderId}
            dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
          />
        </Elements>
      ) : (
        // Address selected — waiting for PaymentIntent to initialize (brief spinner)
        // OR no address yet — show a card-mode shell so user can pick address
        <CardAddressShell
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses}
          onAddressSaved={(addr) => setSavedAddresses((prev) => [...prev, addr])}
          items={items} food={food} makerName={makerName}
          estimate={estimate} estimating={estimating}
          dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
        />
      )}
    </div>
  )
}
