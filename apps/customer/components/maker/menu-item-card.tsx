'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, Minus } from 'lucide-react'
import { cn, formatPriceDollars } from '@/lib/utils'
import { DietaryBadge } from '@/components/ui/badge'
import { useCartStore } from '@/store/cart'
import type { MenuItem, FoodMaker } from '@/types'

interface MenuItemCardProps {
  item: MenuItem
  maker: FoodMaker
}

export function MenuItemCard({ item, maker }: MenuItemCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [notes, setNotes] = useState('')
  const { items, addItem, updateQuantity } = useCartStore()

  const cartItem = items.find((i) => i.menu_item.id === item.id)
  const quantity = cartItem?.quantity ?? 0

  const handleAdd = () => {
    if (!item.is_available) return
    addItem(item, maker.id, maker.display_name, notes)
    setShowModal(false)
    setNotes('')
  }

  return (
    <>
      <div
        className={cn(
          'flex gap-4 px-4 py-4 border-b border-gray-50 active:bg-gray-50/70 transition-colors cursor-pointer',
          !item.is_available && 'opacity-50 cursor-default'
        )}
        onClick={() => item.is_available && setShowModal(true)}
      >
        {/* Text */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-[14px] leading-snug">{item.name}</h4>
          {item.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">
              {formatPriceDollars(item.price)}
            </span>
            {item.dietary_tags.map((tag) => (
              <DietaryBadge key={tag} label={tag} />
            ))}
          </div>
          {!item.is_available && (
            <span className="text-xs text-red-400 font-semibold mt-1 block">Sold out today</span>
          )}
        </div>

        {/* Photo + controls */}
        <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 flex-shrink-0 overflow-hidden">
          {item.photo_url ? (
            <Image
              src={item.photo_url}
              alt={item.name}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
          )}

          {/* Quantity stepper or Add button */}
          {quantity > 0 ? (
            <div
              className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-white rounded-full shadow-md px-1.5 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => updateQuantity(item.id, quantity - 1)}
                className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors"
              >
                <Minus size={10} strokeWidth={2.5} />
              </button>
              <span className="text-xs font-bold text-gray-900 w-4 text-center tabular-nums">
                {quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, quantity + 1)}
                className="w-6 h-6 bg-[#FF6B35] rounded-full flex items-center justify-center active:bg-[#E55A24] transition-colors"
              >
                <Plus size={10} strokeWidth={2.5} className="text-white" />
              </button>
            </div>
          ) : (
            item.is_available && (
              <button
                className="absolute bottom-1.5 right-1.5 w-8 h-8 bg-[#FF6B35] rounded-full flex items-center justify-center shadow-cta active:bg-[#E55A24] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowModal(true)
                }}
                aria-label={`Add ${item.name}`}
              >
                <Plus size={15} strokeWidth={2.5} className="text-white" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Add to Cart bottom sheet */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setShowModal(false)}
        >
          <div className="absolute inset-0 bg-black/50 fade-in" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl pb-nav sheet-enter"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Item photo hero if available */}
            {item.photo_url && (
              <div className="relative w-full h-44 bg-gray-100 overflow-hidden">
                <Image
                  src={item.photo_url}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="430px"
                />
              </div>
            )}

            <div className="px-5 pt-4 pb-5 space-y-4">
              <div>
                <h3 className="heading-lg text-gray-900">{item.name}</h3>
                {item.description && (
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.description}</p>
                )}
                <p className="font-bold text-[#FF6B35] text-lg mt-2">{formatPriceDollars(item.price)}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Special instructions <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, extra sauce, no onions..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
                  rows={3}
                />
              </div>

              <button
                onClick={handleAdd}
                className="w-full bg-[#FF6B35] text-white font-bold py-4 rounded-2xl text-base active:bg-[#E55A24] transition-colors flex items-center justify-between px-5 shadow-cta"
              >
                <span>Add to order</span>
                <span>{formatPriceDollars(item.price)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
