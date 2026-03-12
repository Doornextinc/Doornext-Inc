'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Star, Clock, MapPin, MessageCircle, ChevronLeft, ShoppingCart } from 'lucide-react'
import { MOCK_MAKERS, MOCK_MENU_ITEMS, getMakerEmoji } from '@/lib/mock-data'
import { MenuItemCard } from '@/components/maker/menu-item-card'
import { DietaryBadge } from '@/components/ui/badge'
import { useCartStore } from '@/store/cart'
import { formatDistance, formatTime } from '@/lib/utils'

export default function MakerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const maker = MOCK_MAKERS.find((m) => m.id === id)
  const menuItems = MOCK_MENU_ITEMS[id] ?? []
  const { items: cartItems, subtotal, totalItems } = useCartStore()
  const cartTotal = subtotal()
  const cartCount = totalItems()

  const menuByCategory = useMemo(() => {
    const grouped: Record<string, typeof menuItems> = {}
    for (const item of menuItems) {
      const cat = item.category ?? 'Menu'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(item)
    }
    return grouped
  }, [menuItems])

  if (!maker) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Maker not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-white">
      {/* Hero Banner */}
      <div className="relative w-full h-56 bg-gradient-to-br from-orange-100 to-amber-50">
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-8xl">{getMakerEmoji(id)}</span>
        </div>
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-sm"
        >
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        {/* Open badge */}
        <div
          className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold ${
            maker.is_open
              ? 'bg-green-500 text-white'
              : 'bg-gray-800/80 text-white'
          }`}
        >
          {maker.is_open ? '● Open' : '● Closed'}
        </div>
      </div>

      {/* Maker Info */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0 -mt-10 border-2 border-white shadow-lg">
            <span className="text-white text-2xl font-black">
              {maker.display_name[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900">{maker.display_name}</h1>
            <div className="flex flex-wrap gap-1 mt-1">
              {maker.cuisine_tags.map((tag) => (
                <DietaryBadge key={tag} label={tag} />
              ))}
            </div>
          </div>
        </div>

        {maker.bio && (
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">{maker.bio}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="font-bold text-gray-900">{maker.avg_rating.toFixed(1)}</span>
            <span className="text-gray-400">({maker.total_reviews} reviews)</span>
          </div>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock size={13} />
            <span>{formatTime(maker.prep_time_mins)} prep</span>
          </div>
          {maker.distance_km !== undefined && (
            <>
              <span className="text-gray-200">|</span>
              <div className="flex items-center gap-1 text-gray-500">
                <MapPin size={13} />
                <span>{formatDistance(maker.distance_km)} away</span>
              </div>
            </>
          )}
        </div>

        {/* Chat button */}
        <button className="flex items-center gap-2 mt-3 text-sm text-[#FF6B35] font-semibold">
          <MessageCircle size={16} />
          Message {maker.display_name.split(' ')[0]}
        </button>
      </div>

      {/* Menu */}
      <div className="flex-1">
        {Object.entries(menuByCategory).map(([category, items]) => (
          <div key={category}>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">
                {category}
              </h2>
            </div>
            {items.map((item) => (
              <MenuItemCard key={item.id} item={item} maker={maker} />
            ))}
          </div>
        ))}

        {menuItems.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="text-4xl mb-3">🍽️</span>
            <p className="text-gray-400">Menu coming soon</p>
          </div>
        )}
      </div>

      {/* Cart CTA */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-6 z-40">
          <button
            onClick={() => router.push('/cart')}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 px-5 flex items-center justify-between shadow-lg shadow-orange-200 active:bg-[#E55A24] transition-colors"
          >
            <div className="bg-white/20 rounded-lg w-7 h-7 flex items-center justify-center">
              <span className="text-sm font-bold">{cartCount}</span>
            </div>
            <span className="font-bold text-base">View Cart</span>
            <div className="flex items-center gap-1">
              <ShoppingCart size={16} />
              <span className="font-bold">${cartTotal.toFixed(2)}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
