'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Clock } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceDollars } from '@/lib/utils'

const DELIVERY_FEE = 3.99
const PLATFORM_FEE_PCT = 0.05

const TIP_OPTIONS = [
  { label: 'No tip', value: 0 },
  { label: '10%', value: 0.1 },
  { label: '15%', value: 0.15 },
  { label: '20%', value: 0.2 },
]

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, makerName, clearCart } = useCartStore()
  const [address, setAddress] = useState('')
  const [tipPct, setTipPct] = useState(0.15)
  const [loading, setLoading] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  const food = subtotal()
  const platformFee = food * PLATFORM_FEE_PCT
  const tip = food * tipPct
  const total = food + DELIVERY_FEE + platformFee + tip

  const handlePlaceOrder = async () => {
    if (!address.trim()) {
      alert('Please enter your delivery address')
      return
    }
    setLoading(true)
    // Simulate order placement (Stripe integration will go here)
    await new Promise((r) => setTimeout(r, 1500))
    clearCart()
    // Mock order ID
    const orderId = 'order_' + Math.random().toString(36).slice(2, 9)
    router.push(`/orders/${orderId}`)
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Checkout" />

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

        {/* Scheduled Delivery */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Delivery Time</h3>
          </div>
          <div className="flex gap-2">
            {['ASAP', 'Schedule'].map((opt) => (
              <button
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

        {/* Payment */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} className="text-[#FF6B35]" />
            <h3 className="font-bold text-gray-900">Payment</h3>
          </div>
          <div className="space-y-3">
            <Input
              placeholder="Card number"
              value={cardNumber}
              onChange={(e) =>
                setCardNumber(
                  e.target.value
                    .replace(/\D/g, '')
                    .slice(0, 16)
                    .replace(/(\d{4})(?=\d)/g, '$1 ')
                )
              }
              inputMode="numeric"
              autoComplete="cc-number"
            />
            <div className="flex gap-3">
              <Input
                placeholder="MM / YY"
                value={expiry}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setExpiry(v.length > 2 ? v.slice(0, 2) + ' / ' + v.slice(2) : v)
                }}
                inputMode="numeric"
                autoComplete="cc-exp"
                className="flex-1"
              />
              <Input
                placeholder="CVV"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="cc-csc"
                className="flex-1"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="flex gap-2 mt-3">
            <button className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <span>🍎</span> Apple Pay
            </button>
            <button className="flex-1 bg-white border border-gray-200 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <span>G</span> Google Pay
            </button>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white px-4 py-4">
          <h3 className="font-bold text-gray-900 mb-3">
            Order from <span className="text-[#FF6B35]">{makerName}</span>
          </h3>
          {items.slice(0, 3).map(({ menu_item, quantity }) => (
            <div
              key={menu_item.id}
              className="flex justify-between text-sm text-gray-600 py-1"
            >
              <span>
                {quantity}x {menu_item.name}
              </span>
              <span>{formatPriceDollars(menu_item.price * quantity)}</span>
            </div>
          ))}
          {items.length > 3 && (
            <p className="text-xs text-gray-400 mt-1">+{items.length - 3} more items</p>
          )}
          <div className="h-px bg-gray-100 my-3" />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatPriceDollars(food)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Delivery</span>
              <span>{formatPriceDollars(DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Service fee</span>
              <span>{formatPriceDollars(platformFee)}</span>
            </div>
            {tip > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tip</span>
                <span>{formatPriceDollars(tip)}</span>
              </div>
            )}
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatPriceDollars(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Place Order */}
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button
          fullWidth
          size="lg"
          loading={loading}
          onClick={handlePlaceOrder}
        >
          Place Order · {formatPriceDollars(total)}
        </Button>
      </div>
    </div>
  )
}
