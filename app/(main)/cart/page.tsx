'use client'

import { useRouter } from 'next/navigation'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { formatPriceDollars } from '@/lib/utils'

const DELIVERY_FEE = 3.99
const PLATFORM_FEE_PCT = 0.05

export default function CartPage() {
  const router = useRouter()
  const { items, updateQuantity, removeItem, clearCart, subtotal, makerName } =
    useCartStore()
  const total = subtotal()
  const platformFee = total * PLATFORM_FEE_PCT
  const orderTotal = total + DELIVERY_FEE + platformFee

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-white">
        <BackBar title="Your Cart" />
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
          <ShoppingBag size={64} className="text-gray-200 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Your cart is empty</h2>
          <p className="text-gray-400 text-sm mt-1 mb-6">
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
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar
        title="Your Cart"
        rightAction={
          <button
            onClick={clearCart}
            className="text-xs text-red-400 font-semibold"
          >
            Clear
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Maker name */}
        <div className="bg-white px-4 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-500">
            Order from{' '}
            <span className="font-semibold text-gray-800">{makerName}</span>
          </p>
        </div>

        {/* Cart items */}
        <div className="bg-white mt-2">
          {items.map(({ menu_item: item, quantity, notes }) => (
            <div
              key={item.id}
              className="flex gap-3 px-4 py-4 border-b border-gray-50"
            >
              <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                🍽️
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                {notes && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    Note: {notes}
                  </p>
                )}
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {formatPriceDollars(item.price * quantity)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.id, quantity - 1)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
                >
                  {quantity === 1 ? (
                    <Trash2 size={12} className="text-red-400" />
                  ) : (
                    <Minus size={12} className="text-gray-600" />
                  )}
                </button>
                <span className="text-sm font-bold text-gray-900 w-5 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, quantity + 1)}
                  className="w-7 h-7 rounded-full bg-[#FF6B35] flex items-center justify-center active:bg-[#E55A24]"
                >
                  <Plus size={12} className="text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="bg-white mt-2 px-4 py-4">
          <h3 className="font-bold text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatPriceDollars(total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery fee</span>
              <span>{formatPriceDollars(DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Service fee</span>
              <span>{formatPriceDollars(platformFee)}</span>
            </div>
            <div className="h-px bg-gray-100 my-2" />
            <div className="flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatPriceDollars(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Add more items */}
        <button
          onClick={() => router.back()}
          className="w-full bg-white mt-2 py-4 text-[#FF6B35] font-semibold text-sm text-center"
        >
          + Add more items
        </button>
      </div>

      {/* Checkout CTA */}
      <div className="bg-white border-t border-gray-100 px-4 py-4 pb-nav">
        <Button
          fullWidth
          size="lg"
          onClick={() => router.push('/checkout')}
        >
          Proceed to Checkout · {formatPriceDollars(orderTotal)}
        </Button>
      </div>
    </div>
  )
}
