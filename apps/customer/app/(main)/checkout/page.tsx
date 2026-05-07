'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock, Lock, Banknote, Loader2, MessageSquare, Store } from 'lucide-react'
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
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Generate a client-side UUID (v4) for order_group_id */
function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
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
  { id: 'leave_door',  emoji: '🚪', label: 'Leave at door' },
  { id: 'hand_to_me', emoji: '🤝', label: 'Hand to me' },
  { id: 'doorman',    emoji: '🏢', label: 'Leave with doorman' },
  { id: 'ring_bell',  emoji: '🔔', label: 'Ring bell / knock' },
  { id: 'neighbor',   emoji: '👥', label: 'Leave with neighbor' },
  { id: 'other',      emoji: '✏️', label: 'Other' },
] as const

type DropoffOptionId = typeof DROPOFF_OPTIONS[number]['id']

function DropoffNoteSection({ note, setNote }: { note: string; setNote: (v: string) => void }) {
  const [selected, setSelected] = useState<DropoffOptionId | null>(null)
  const [details, setDetails] = useState('')

  const compose = (opt: DropoffOptionId | null, det: string) => {
    if (!opt) { setNote(''); return }
    if (opt === 'other') { setNote(det.trim()) }
    else {
      const label = DROPOFF_OPTIONS.find(o => o.id === opt)!.label
      setNote(det.trim() ? `${label} — ${det.trim()}` : label)
    }
  }

  const handleSelect = (id: DropoffOptionId) => { setSelected(id); compose(id, details) }
  const handleDetails = (val: string) => {
    if (val.length > 200) return
    setDetails(val); compose(selected, val)
  }

  const nothingSelected = !selected
  const otherMissingText = selected === 'other' && details.trim().length === 0

  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={18} className="text-[#FF6B35]" />
        <h3 className="font-bold text-gray-900">
          Drop-off Instructions<span className="text-red-500 ml-0.5">*</span>
        </h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">How should the driver handle your order?</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {DROPOFF_OPTIONS.map((opt) => {
          const active = selected === opt.id
          return (
            <button key={opt.id} type="button" onClick={() => handleSelect(opt.id)}
              className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 text-left transition-colors ${
                active ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]' : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="text-lg leading-none">{opt.emoji}</span>
              <span className={`text-xs font-semibold leading-tight ${active ? 'text-[#FF6B35]' : 'text-gray-700'}`}>{opt.label}</span>
            </button>
          )
        })}
      </div>
      {selected && (
        <div>
          <textarea value={details} onChange={(e) => handleDetails(e.target.value)}
            placeholder={selected === 'other' ? 'Describe where to leave your order…' : 'Add details — apt number, gate code, floor, etc. (optional)'}
            rows={2}
            className={`w-full border-2 rounded-xl px-3.5 py-3 text-sm outline-none transition-colors resize-none ${
              otherMissingText ? 'border-red-200 focus:border-red-400 bg-red-50/30' : 'border-gray-100 focus:border-[#FF6B35]'
            }`}
          />
          <div className="flex items-center justify-between mt-1">
            {otherMissingText ? (
              <p className="text-xs text-red-400 font-medium">Please describe where to leave your order</p>
            ) : <span />}
            <span className={`text-xs ml-auto ${details.length > 180 ? 'text-red-400' : 'text-gray-300'}`}>{details.length}/200</span>
          </div>
        </div>
      )}
      {nothingSelected && <p className="text-xs text-red-400 font-medium mt-1">Required — select a drop-off option</p>}
    </div>
  )
}

/* ── Combined order summary (all makers) ── */
function MultiOrderSummary({
  makerEntries,
  estimates,
  estimating,
}: {
  makerEntries: Array<[string, { makerName: string; items: CartItem[] }]>
  estimates: Record<string, FeeEstimate>
  estimating: boolean
}) {
  const grandSubtotal = makerEntries.reduce(
    (sum, [, mc]) => sum + mc.items.reduce((s, i) => s + i.menu_item.price * i.quantity, 0),
    0
  )
  const grandDelivery = Object.values(estimates).reduce((s, e) => s + e.delivery_fee, 0)
  const grandService  = Object.values(estimates).reduce((s, e) => s + e.service_fee,  0)
  const grandSmall    = Object.values(estimates).reduce((s, e) => s + e.small_order_fee, 0)
  const grandSurge    = Object.values(estimates).reduce((s, e) => s + e.surge_fee, 0)
  const grandTotal    = Object.values(estimates).reduce((s, e) => s + e.total, 0)
  const hasEstimates  = Object.keys(estimates).length > 0

  return (
    <div className="bg-white px-4 py-4">
      <h3 className="font-bold text-gray-900 mb-3">Order Summary</h3>

      {/* Per-maker breakdown */}
      {makerEntries.map(([makerId, mc]) => {
        const sub = mc.items.reduce((s, i) => s + i.menu_item.price * i.quantity, 0)
        const est = estimates[makerId]
        return (
          <div key={makerId} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
            <div className="flex items-center gap-1.5 mb-2">
              <Store size={13} className="text-[#FF6B35]" />
              <span className="text-xs font-bold text-gray-800">{mc.makerName}</span>
            </div>
            {mc.items.slice(0, 3).map(({ menu_item, quantity }) => (
              <div key={menu_item.id} className="flex justify-between text-xs text-gray-500 py-0.5">
                <span>{quantity}× {menu_item.name}</span>
                <span>{formatPriceDollars(menu_item.price * quantity)}</span>
              </div>
            ))}
            {mc.items.length > 3 && (
              <p className="text-xs text-gray-400 mt-0.5">+{mc.items.length - 3} more</p>
            )}
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPriceDollars(sub)}</span></div>
              <div className="flex justify-between">
                <span>Delivery</span>
                {estimating && !est ? (
                  <span className="flex items-center gap-1 text-gray-400"><Loader2 size={10} className="animate-spin" />…</span>
                ) : est ? (
                  <span>{formatPriceDollars(est.delivery_fee)}</span>
                ) : (
                  <span className="text-gray-400">Enter address</span>
                )}
              </div>
              {est?.small_order_fee ? (
                <div className="flex justify-between"><span>Small order fee</span><span>{formatPriceDollars(est.small_order_fee)}</span></div>
              ) : null}
              {est?.surge_fee ? (
                <div className="flex justify-between text-amber-600"><span>Surge</span><span>{formatPriceDollars(est.surge_fee)}</span></div>
              ) : null}
              <div className="flex justify-between"><span>Service fee</span><span>{est ? formatPriceDollars(est.service_fee) : formatPriceDollars(sub * PLATFORM_FEE_PCT)}</span></div>
            </div>
          </div>
        )
      })}

      {/* Grand total */}
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-500"><span>Items subtotal</span><span>{formatPriceDollars(grandSubtotal)}</span></div>
        <div className="flex justify-between text-gray-500">
          <span>Total delivery</span>
          {estimating ? (
            <span className="flex items-center gap-1 text-gray-400"><Loader2 size={12} className="animate-spin" />Calculating…</span>
          ) : hasEstimates ? (
            <span>{formatPriceDollars(grandDelivery)}</span>
          ) : (
            <span className="text-gray-400 text-xs">Enter address</span>
          )}
        </div>
        {grandSmall > 0 && <div className="flex justify-between text-gray-500"><span>Small order fees</span><span>{formatPriceDollars(grandSmall)}</span></div>}
        {grandSurge > 0 && <div className="flex justify-between text-amber-600"><span>Surge fees</span><span>{formatPriceDollars(grandSurge)}</span></div>}
        <div className="flex justify-between text-gray-500"><span>Total service fee</span><span>{formatPriceDollars(hasEstimates ? grandService : grandSubtotal * PLATFORM_FEE_PCT)}</span></div>
        <div className="h-px bg-gray-100 my-1" />
        <div className="flex justify-between font-bold text-gray-900 text-base">
          <span>Grand Total</span>
          {estimating ? (
            <Loader2 size={14} className="animate-spin text-gray-400" />
          ) : hasEstimates ? (
            <span>{formatPriceDollars(grandTotal)}</span>
          ) : (
            <span>{formatPriceDollars(grandSubtotal * (1 + PLATFORM_FEE_PCT))}</span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">You can tip your driver after delivery</p>
    </div>
  )
}

/* ── Shell shown before address / before PaymentIntent is ready ── */
function CardAddressShell({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved, makerEntries, estimates, estimating, estimateError,
  dropoffNote, setDropoffNote, onRetryEstimate,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  makerEntries: Array<[string, { makerName: string; items: CartItem[] }]>
  estimates: Record<string, FeeEstimate>; estimating: boolean; estimateError: string | null
  dropoffNote: string; setDropoffNote: (v: string) => void
  onRetryEstimate: () => void
}) {
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0 || !selectedAddress)
  const allEstimated = makerEntries.every(([id]) => estimates[id])
  const hasDropoff = dropoffNote.trim().length > 0
  // waitingForIntent = PI is being created (estimates done, address set, no error yet)
  const waitingForIntent = !!selectedAddress && allEstimated && !estimating && !estimateError

  const buttonLabel = waitingForIntent
    ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Preparing payment…</span>
    : estimating
    ? 'Calculating delivery fee…'
    : estimateError
    ? 'Failed to calculate fee — tap to retry'
    : !selectedAddress
    ? 'Enter delivery address to continue'
    : !hasDropoff
    ? 'Select drop-off instructions above ↑'
    : !allEstimated
    ? 'Calculating delivery fee…'
    : 'Enter delivery address to continue'

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
        <MultiOrderSummary makerEntries={makerEntries} estimates={estimates} estimating={estimating} />
      </div>
      {estimateError && !estimating && (
        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <span className="flex-1">{estimateError}</span>
          <button type="button" onClick={onRetryEstimate} className="font-semibold underline text-red-700 flex-shrink-0">Retry</button>
        </div>
      )}
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button fullWidth size="lg" disabled={!estimateError} onClick={estimateError ? onRetryEstimate : undefined}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}

/* ── Card checkout form (with Stripe Elements) ── */
function CardCheckoutForm({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved,
  makerEntries, estimates, estimating, estimateError,
  orderIds, dropoffNote, setDropoffNote,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  makerEntries: Array<[string, { makerName: string; items: CartItem[] }]>
  estimates: Record<string, FeeEstimate>; estimating: boolean; estimateError: string | null
  orderIds: string[]
  dropoffNote: string; setDropoffNote: (v: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)

  const allEstimated = makerEntries.every(([id]) => estimates[id])
  const grandTotal = Object.values(estimates).reduce((s, e) => s + e.total, 0)
  const canPlace = !!selectedAddress && allEstimated && !estimating && dropoffNote.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (!dropoffNote.trim()) { setError('Drop-off instructions are required'); return }
    if (!allEstimated) { setError('Waiting for delivery fee calculation…'); return }
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
      // Persist address + drop-off note on all orders in the group
      if (orderIds.length > 0) {
        await supabase.from('orders')
          .update({ delivery_address: deliveryAddress, dropoff_note: dropoffNote.trim() })
          .in('id', orderIds)
      }
      clearCart()
      router.push('/orders')
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
        <MultiOrderSummary makerEntries={makerEntries} estimates={estimates} estimating={estimating} />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        {estimateError && !estimating && (
          <p className="text-sm text-red-500 mb-2 text-center">{estimateError}</p>
        )}
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!stripe || !canPlace}>
          {canPlace
            ? `Place Order · ${formatPriceDollars(grandTotal)}`
            : !selectedAddress
            ? 'Enter delivery address to continue'
            : !dropoffNote.trim()
            ? 'Select drop-off instructions above ↑'
            : estimating || !allEstimated
            ? 'Calculating delivery fee…'
            : estimateError
            ? 'Delivery fee unavailable — go back and retry'
            : 'Enter delivery address to continue'}
        </Button>
      </div>
    </form>
  )
}

/* ── Cash checkout form ── */
function CashCheckoutForm({
  address, setAddress, selectedAddress, setSelectedAddress,
  savedAddresses, onAddressSaved,
  makerEntries, estimates, estimating,
  makerDistances, onSuccess,
  dropoffNote, setDropoffNote,
}: {
  address: string; setAddress: (v: string) => void
  selectedAddress: Address | null; setSelectedAddress: (a: Address | null) => void
  savedAddresses: Address[]; onAddressSaved: (addr: Address) => void
  makerEntries: Array<[string, { makerName: string; items: CartItem[] }]>
  estimates: Record<string, FeeEstimate>; estimating: boolean; estimateError: string | null
  makerDistances: Record<string, number>
  onSuccess: (orderGroupId: string) => void
  dropoffNote: string; setDropoffNote: (v: string) => void
}) {
  const { makers, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddressInput, setShowAddressInput] = useState(savedAddresses.length === 0)

  const allEstimated = makerEntries.every(([id]) => estimates[id])
  const grandTotal = Object.values(estimates).reduce((s, e) => s + e.total, 0)
  const canPlace = !!selectedAddress && allEstimated && !estimating && dropoffNote.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) { setError('Please enter your delivery address'); return }
    if (!dropoffNote.trim()) { setError('Drop-off instructions are required'); return }
    if (!allEstimated) { setError('Waiting for delivery fee calculation…'); return }
    setLoading(true); setError(null)

    const deliveryAddress = selectedAddress
      ? { street: selectedAddress.street, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip, lat: selectedAddress.lat, lng: selectedAddress.lng }
      : { street: address.trim(), city: '', state: '', zip: '' }

    const orderGroupId = uuid4()

    try {
      const res = await fetch('/api/checkout-cash-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          makers: makerEntries.map(([makerId, mc]) => ({
            maker_id: makerId,
            items: mc.items.map((i) => ({ id: i.menu_item.id, quantity: i.quantity, notes: i.notes })),
            distance_miles: makerDistances[makerId] ?? 0,
          })),
          delivery_address: deliveryAddress,
          dropoff_note: dropoffNote.trim(),
          order_group_id: orderGroupId,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? 'Failed to place order. Please try again.'); return }
      clearCart()
      onSuccess(data.orderGroupId)
    } catch {
      setError('Failed to place order. Please try again.')
    } finally {
      setLoading(false)
    }
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
                {allEstimated && !estimating && (
                  <> Your driver will collect <span className="font-bold">{formatPriceDollars(grandTotal)}</span> on delivery.</>
                )}
              </p>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
        <MultiOrderSummary makerEntries={makerEntries} estimates={estimates} estimating={estimating} />
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!canPlace}>
          {canPlace
            ? `Place Cash Order · ${formatPriceDollars(grandTotal)}`
            : !selectedAddress
            ? 'Enter delivery address to continue'
            : !dropoffNote.trim()
            ? 'Select drop-off instructions above ↑'
            : estimating || !allEstimated
            ? 'Calculating delivery fee…'
            : 'Enter delivery address to continue'}
        </Button>
      </div>
    </form>
  )
}

/* ── Main page ── */
export default function CheckoutPage() {
  const router = useRouter()
  const { makers, subtotal, makerIds, clearCart } = useCartStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderIds, setOrderIds] = useState<string[]>([])
  const [orderGroupId, setOrderGroupId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [dropoffNote, setDropoffNote] = useState('')
  const [initError, setInitError] = useState<string | null>(null)

  // Maker locations (lat/lng) keyed by makerId
  const [makerLocations, setMakerLocations] = useState<Record<string, { lat: number; lng: number }>>({})
  // Distance in miles from each maker to the selected address
  const [makerDistances, setMakerDistances] = useState<Record<string, number>>({})
  // Per-maker fee estimates
  const [estimates, setEstimates] = useState<Record<string, FeeEstimate>>({})
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)

  // useMemo keeps these stable between renders — only recomputes when `makers` actually changes.
  // Without this, Object.entries() produces a new array reference every render, which makes
  // fetchAllEstimates / createCardIntent new functions every render, causing an infinite effect loop.
  const allMakerIds = useMemo(() => (mounted ? Object.keys(makers) : []), [mounted, makers])
  const makerEntries = useMemo(
    () => (mounted ? (Object.entries(makers) as Array<[string, { makerName: string; items: CartItem[] }]>) : []),
    [mounted, makers]
  )
  const food = useMemo(() => (mounted ? subtotal() : 0), [mounted, makers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved addresses + all maker locations
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [addrRes, profileRes, ...makerResults] = await Promise.all([
        supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('users').select('default_address_id').eq('id', user.id).single(),
        ...allMakerIds.map((mid) =>
          supabase.from('food_makers').select('id, lat, lng').eq('id', mid).single()
        ),
      ])

      const addrs: Address[] = addrRes.data || []
      setSavedAddresses(addrs)

      const locations: Record<string, { lat: number; lng: number }> = {}
      for (const res of makerResults) {
        if (res.data?.id) {
          locations[res.data.id] = { lat: res.data.lat, lng: res.data.lng }
        }
      }
      setMakerLocations(locations)

      const defaultId = profileRes.data?.default_address_id
      const def = defaultId ? addrs.find((a) => a.id === defaultId) : addrs[0]
      if (def) {
        setSelectedAddress(def)
        setAddress(`${def.street}, ${def.city}, ${def.state} ${def.zip}`)
      }
    }
    if (mounted && allMakerIds.length > 0) load()
  // allMakerIds is now stable (useMemo) so this won't loop — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, allMakerIds])

  // Compute distances and fetch estimates whenever address or maker locations change
  const fetchAllEstimates = useCallback(async (addr: Address) => {
    if (allMakerIds.length === 0) return

    const addrValid = addr.lat != null && addr.lng != null && !(addr.lat === 0 && addr.lng === 0)
    const distances: Record<string, number> = {}
    for (const mid of allMakerIds) {
      const loc = makerLocations[mid]
      const makerValid = loc && !(loc.lat === 0 && loc.lng === 0)
      distances[mid] = addrValid && makerValid
        ? haversineMiles(loc.lat, loc.lng, addr.lat, addr.lng)
        : 0
    }
    setMakerDistances(distances)

    setEstimating(true)
    setEstimateError(null)
    try {
      const results = await Promise.all(
        makerEntries.map(async ([makerId, mc]) => {
          const sub = mc.items.reduce((s, i) => s + i.menu_item.price * i.quantity, 0)
          const res = await fetch('/api/checkout/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maker_id: makerId, subtotal: sub, distance_miles: distances[makerId] ?? 0 }),
          })
          const data = await res.json()
          if (!res.ok) return [makerId, null, data.error ?? `Estimate failed (${res.status})`] as const
          return [makerId, data as FeeEstimate, null] as const
        })
      )
      const newEstimates: Record<string, FeeEstimate> = {}
      const errors: string[] = []
      for (const [mid, est, err] of results) {
        if (est) newEstimates[mid] = est
        else if (err) errors.push(err)
      }
      setEstimates(newEstimates)
      if (errors.length > 0) {
        setEstimateError(errors[0])
      }
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : 'Failed to calculate delivery fee')
    } finally {
      setEstimating(false)
    }
  }, [allMakerIds, makerEntries, makerLocations])

  useEffect(() => {
    if (selectedAddress) {
      setEstimates({})
      setEstimateError(null)
      setClientSecret(null)
      setOrderIds([])
      setOrderGroupId(null)
      fetchAllEstimates(selectedAddress)
    }
  }, [selectedAddress, makerLocations, fetchAllEstimates])

  // Exposed retry: re-fetch estimates for the current address
  const retryEstimates = useCallback(() => {
    if (selectedAddress) {
      setEstimates({})
      setEstimateError(null)
      setClientSecret(null)
      setOrderIds([])
      setOrderGroupId(null)
      fetchAllEstimates(selectedAddress)
    }
  }, [selectedAddress, fetchAllEstimates])

  // Create combined PaymentIntent once all estimates are ready (card only)
  const createCardIntent = useCallback(async () => {
    const allEstimated = allMakerIds.every((id) => estimates[id])
    if (!allEstimated || paymentMethod !== 'card' || allMakerIds.length === 0) return
    setInitError(null)
    const groupId = uuid4()
    try {
      const res = await fetch('/api/checkout-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          makers: makerEntries.map(([makerId, mc]) => ({
            maker_id: makerId,
            items: mc.items.map((i) => ({ id: i.menu_item.id, price: i.menu_item.price, quantity: i.quantity, notes: i.notes })),
            distance_miles: makerDistances[makerId] ?? 0,
          })),
          order_group_id: groupId,
        }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (data.error) { setInitError(data.error); return }
      setClientSecret(data.clientSecret)
      setOrderIds(data.orderIds ?? [])
      setOrderGroupId(groupId)
    } catch {
      setInitError('Failed to initialize payment. Please try again.')
    }
  }, [estimates, allMakerIds, paymentMethod, makerEntries, makerDistances, router])

  useEffect(() => {
    const allEstimated = allMakerIds.length > 0 && allMakerIds.every((id) => estimates[id])
    if (allEstimated && paymentMethod === 'card' && !clientSecret) {
      createCardIntent()
    }
  }, [estimates, paymentMethod, clientSecret, createCardIntent, allMakerIds])

  if (!mounted) return null

  if (makerEntries.length === 0) {
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
            onClick={() => { setPaymentMethod('card'); setClientSecret(null); setOrderIds([]); setOrderGroupId(null) }}
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
          makerEntries={makerEntries}
          estimates={estimates} estimating={estimating} estimateError={estimateError}
          makerDistances={makerDistances}
          onSuccess={(_gid) => router.push('/orders')}
          dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
        />
      ) : initError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-gray-700 font-semibold">Payment initialization failed</p>
          <p className="text-gray-400 text-sm">{initError}</p>
          <Button onClick={createCardIntent}>Try Again</Button>
        </div>
      ) : clientSecret && orderIds.length > 0 ? (
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
            makerEntries={makerEntries}
            estimates={estimates} estimating={estimating} estimateError={estimateError}
            orderIds={orderIds}
            dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
          />
        </Elements>
      ) : (
        <CardAddressShell
          address={address} setAddress={setAddress}
          selectedAddress={selectedAddress} setSelectedAddress={setSelectedAddress}
          savedAddresses={savedAddresses}
          onAddressSaved={(addr) => setSavedAddresses((prev) => [...prev, addr])}
          makerEntries={makerEntries}
          estimates={estimates} estimating={estimating} estimateError={estimateError}
          dropoffNote={dropoffNote} setDropoffNote={setDropoffNote}
          onRetryEstimate={retryEstimates}
        />
      )}
    </div>
  )
}
