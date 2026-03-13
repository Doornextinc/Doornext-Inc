'use client'

import { useState } from 'react'
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
          'flex gap-3 px-4 py-4 border-b border-gray-50 active:bg-gray-50 transition-colors',
          !item.is_available && 'opacity-50'
        )}
        onClick={() => item.is_available && setShowModal(true)}
      >
        {/* Text */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</h4>
          {item.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">
              {formatPriceDollars(item.price)}
            </span>
            {item.dietary_tags.map((tag) => (
              <DietaryBadge key={tag} label={tag} />
            ))}
          </div>
          {!item.is_available && (
            <span className="text-xs text-red-400 font-medium mt-1 block">
              Sold out today
            </span>
          )}
        </div>

        {/* Photo / Add button */}
        <div className="relative w-20 h-20 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 flex-shrink-0 overflow-hidden">
          {item.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photo_url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              🍽️
            </div>
          )}
          {/* Quantity controls */}
          {quantity > 0 ? (
            <div
              className="absolute bottom-1 right-1 flex items-center gap-1 bg-white rounded-full shadow-md px-1 py-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => updateQuantity(item.id, quantity - 1)}
                className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200"
              >
                <Minus size={10} />
              </button>
              <span className="text-xs font-bold text-gray-900 w-4 text-center">
                {quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, quantity + 1)}
                className="w-5 h-5 bg-[#FF6B35] rounded-full flex items-center justify-center active:bg-[#E55A24]"
              >
                <Plus size={10} className="text-white" />
              </button>
            </div>
          ) : (
            item.is_available && (
              <button
                className="absolute bottom-1 right-1 w-7 h-7 bg-[#FF6B35] rounded-full flex items-center justify-center shadow-md active:bg-[#E55A24]"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowModal(true)
                }}
              >
                <Plus size={14} className="text-white" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Add to Cart Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setShowModal(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">{item.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{item.description}</p>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Special instructions (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, extra sauce, no onions..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
                rows={3}
              />
            </div>

            <button
              onClick={handleAdd}
              className="w-full bg-[#FF6B35] text-white font-bold py-4 rounded-xl text-base active:bg-[#E55A24] transition-colors flex items-center justify-between px-6"
            >
              <span>Add to order</span>
              <span>{formatPriceDollars(item.price)}</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
