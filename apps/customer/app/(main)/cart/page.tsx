'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { formatPriceDollars } from '@/lib/utils'
import { DELIVERY_FEE, PLATFORM_FEE_PCT } from '@/lib/constants'

export default function CartPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => setMounted(true), [])
  const { items, updateQuantity, clearCart, subtotal, makerName } = useCartStore()
  const total = mounted ? subtotal() : 0
  const platformFee = total * PLATFORM_FEE_PCT
  const orderTotal = total + DELIVERY_FEE + platformFee

  if (!mounted || items.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-white">
        <BackBar title="Your Cart" />
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6 page-enter">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
            <ShoppingBag size={36} className="text-gray-300" />
          </div>
          <h2 className="heading-lg text-gray-800">Your cart is empty</h2>
          <p className="text-gray-400 text-sm mt-2 mb-7 leading-relaxed">
            Browse local food makers and add something delicious
          </p>
          <Button onClick={() => router.push('/')} size="lg">
            Browse Makers
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f9fafb]">
      <BackBar
        title="Your Cart"
        rightAction={
          confirmClear ? (
            <button
              onClick={() => { clearCart(); setConfirmClear(false) }}
              className="text-xs text-red-500 font-bold"
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-red-400 font-semibold"
            >
              Clear
            </button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Maker banner */}
        <div className="bg-white px-4 py-3.5 border-b border-gray-100">
          <p className="text-sm text-gray-500">
            Ordering from{' '}
            <span className="font-bold text-gray-900">{makerName}</span>
          </p>
        </div>

        {/* Items */}
        <div className="bg-white mt-2">
          {items.map(({ menu_item: item, quantity, notes }) => (
            <div
              key={item.id}
              className="flex items-center gap-3.5 px-4 py-4 border-b border-gray-50"
            >
              <div className="relative w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                {item.photo_url ? (
                  <Image
                    src={item.photo_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  '🍽️'
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-[14px] leading-snug">{item.name}</p>
                {notes && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">✏️ {notes}</p>
                )}
                <p className="text-sm font-bold text-gray-900 mt-1.5">
                  {formatPriceDollars(item.price * quantity)}
                </p>
              </div>

              {/* Quantity controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => updateQuantity(item.id, quantity - 1)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
                >
                  {quantity === 1 ? (
                    <Trash2 size={13} className="text-red-400" />
                  ) : (
                    <Minus size={13} className="text-gray-600" />
                  )}
                </button>
                <span className="text-sm font-bold text-gray-900 w-5 text-center tabular-nums">
                  {quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, quantity + 1)}
                  className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center active:bg-[#E55A24] transition-colors"
                >
                  <Plus size={13} className="text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add more items */}
        <button
          onClick={() => router.back()}
          className="w-full bg-white mt-2 py-4 text-[#FF6B35] font-semibold text-sm text-center border-b border-gray-100 active:bg-orange-50 transition-colors"
        >
          + Add more items
        </button>

        {/* Order Summary */}
        <div className="bg-white mt-2 px-4 py-5">
          <h3 className="font-bold text-gray-900 mb-4 text-[15px]">Order Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-800">{formatPriceDollars(total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery fee</span>
              <span className="font-medium text-gray-800">{formatPriceDollars(DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Service fee</span>
              <span className="font-medium text-gray-800">{formatPriceDollars(platformFee)}</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatPriceDollars(orderTotal)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Tip is added at checkout · Final price may vary</p>
        </div>
      </div>

      {/* Checkout CTA */}
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button
          fullWidth
          size="lg"
          onClick={() => router.push('/checkout')}
          className="shadow-cta"
        >
          Checkout · {formatPriceDollars(orderTotal)}
        </Button>
      </div>
    </div>
  )
}
