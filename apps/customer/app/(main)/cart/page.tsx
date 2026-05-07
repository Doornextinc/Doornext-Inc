'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Minus, Plus, Trash2, ShoppingBag, Store, ChevronRight } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { formatPriceDollars } from '@/lib/utils'
import { PLATFORM_FEE_PCT } from '@/lib/constants'

export default function CartPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => setMounted(true), [])

  const { makers, updateQuantity, clearCart, clearMaker, subtotal } = useCartStore()

  const makerEntries = mounted ? Object.entries(makers) : []
  const total = mounted ? subtotal() : 0
  const platformFee = total * PLATFORM_FEE_PCT
  const orderTotal = total + platformFee
  const isEmpty = makerEntries.length === 0

  if (!mounted || isEmpty) {
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
              Confirm clear
            </button>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-red-400 font-semibold"
            >
              Clear all
            </button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto pb-2">
        {/* Multi-maker notice */}
        {makerEntries.length > 1 && (
          <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex items-center gap-2">
            <Store size={15} className="text-[#FF6B35] flex-shrink-0" />
            <p className="text-xs text-orange-700 font-medium">
              Items from <span className="font-bold">{makerEntries.length} makers</span> — delivered together in one trip
            </p>
          </div>
        )}

        {makerEntries.map(([makerId, makerCart]) => {
          const makerSubtotal = makerCart.items.reduce(
            (s, i) => s + i.menu_item.price * i.quantity, 0
          )
          return (
            <div key={makerId} className="mt-2">
              {/* Maker header */}
              <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store size={15} className="text-[#FF6B35]" />
                  <p className="text-sm font-bold text-gray-900">{makerCart.makerName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{formatPriceDollars(makerSubtotal)}</span>
                  <button
                    onClick={() => router.push(`/maker/${makerId}`)}
                    className="text-xs text-[#FF6B35] font-semibold flex items-center gap-0.5"
                  >
                    Add <ChevronRight size={12} />
                  </button>
                  <button
                    onClick={() => clearMaker(makerId)}
                    className="text-xs text-red-400 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Items */}
              <div className="bg-white">
                {makerCart.items.map(({ menu_item: item, quantity, notes }) => (
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
                        onClick={() => updateQuantity(item.id, makerId, quantity - 1)}
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
                        onClick={() => updateQuantity(item.id, makerId, quantity + 1)}
                        className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center active:bg-[#E55A24] transition-colors"
                      >
                        <Plus size={13} className="text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Add from another maker */}
        <button
          onClick={() => router.push('/')}
          className="w-full bg-white mt-2 py-4 text-[#FF6B35] font-semibold text-sm text-center border-b border-gray-100 active:bg-orange-50 transition-colors"
        >
          + Add items from another maker
        </button>

        {/* Order Summary */}
        <div className="bg-white mt-2 px-4 py-5">
          <h3 className="font-bold text-gray-900 mb-4 text-[15px]">Order Summary</h3>
          <div className="space-y-3 text-sm">
            {makerEntries.length > 1 && makerEntries.map(([makerId, mc]) => {
              const s = mc.items.reduce((sum, i) => sum + i.menu_item.price * i.quantity, 0)
              return (
                <div key={makerId} className="flex justify-between text-gray-500">
                  <span className="truncate max-w-[60%]">{mc.makerName}</span>
                  <span className="font-medium text-gray-700">{formatPriceDollars(s)}</span>
                </div>
              )
            })}
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-800">{formatPriceDollars(total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery fee</span>
              <span className="text-xs text-gray-400 italic">Calculated at checkout</span>
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
          <p className="text-xs text-gray-400 mt-3">Delivery fee based on distance · Tip added at checkout</p>
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
          Checkout · {formatPriceDollars(total)} + delivery
        </Button>
      </div>
    </div>
  )
}
