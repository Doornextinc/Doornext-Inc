'use client'

import { useMemo, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Star, Clock, MapPin, MessageCircle, ChevronLeft, ShoppingCart } from 'lucide-react'
import { MenuItemCard } from '@/components/maker/menu-item-card'
import { DietaryBadge } from '@/components/ui/badge'
import { MenuItemSkeleton } from '@/components/ui/skeleton'
import { useCartStore } from '@/store/cart'
import { createClient } from '@/lib/supabase/client'
import { formatDistance, formatTime } from '@/lib/utils'
import type { FoodMaker, MenuItem } from '@/types'

export default function MakerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [maker, setMaker] = useState<FoodMaker | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { subtotal, totalItems } = useCartStore()
  const cartTotal = mounted ? subtotal() : 0
  const cartCount = mounted ? totalItems() : 0

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [makerRes, menuRes] = await Promise.all([
          supabase.from('food_makers').select('*').eq('id', id).single(),
          supabase.from('menu_items').select('*').eq('maker_id', id).order('category'),
        ])

        if (makerRes.data) {
          setMaker(makerRes.data)
          setMenuItems(menuRes.data ?? [])
        }
      } catch (e) {
        console.error('Failed to load maker:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const menuByCategory = useMemo(() => {
    const grouped: Record<string, MenuItem[]> = {}
    for (const item of menuItems) {
      const cat = item.category ?? 'Menu'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(item)
    }
    return grouped
  }, [menuItems])

  if (!loading && !maker) {
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
        {maker?.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={maker.banner_url} alt={maker.display_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-8xl">🍽️</span>
          </div>
        )}
        <button
          aria-label="Go back"
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-sm"
        >
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        {maker && (
          <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold ${maker.is_open ? 'bg-green-500 text-white' : 'bg-gray-800/80 text-white'}`}>
            {maker.is_open ? '● Open' : '● Closed'}
          </div>
        )}
      </div>

      {/* Maker Info */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0 -mt-10 border-2 border-white shadow-lg">
            {maker?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={maker.avatar_url} alt="" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <span className="text-white text-2xl font-black">
                {(maker?.display_name?.[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="space-y-2">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-4 w-32" />
              </div>
            ) : (
              <>
                <h1 className="text-xl font-black text-gray-900">{maker?.display_name}</h1>
                <div className="flex flex-wrap gap-1 mt-1">
                  {maker?.cuisine_tags.map((tag) => (
                    <DietaryBadge key={tag} label={tag} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {maker?.bio && (
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">{maker.bio}</p>
        )}

        {maker && (
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1">
              <Star size={14} className="text-yellow-400 fill-yellow-400" />
              <span className="font-bold text-gray-900">{maker.avg_rating.toFixed(1)}</span>
              <span className="text-gray-400">({maker.total_reviews})</span>
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
        )}

        <button
          onClick={() => router.push(`/chat?makerId=${id}`)}
          className="flex items-center gap-2 mt-3 text-sm text-[#FF6B35] font-semibold"
        >
          <MessageCircle size={16} />
          Message {maker?.display_name?.split("'")[0] ?? 'Maker'}
        </button>
      </div>

      {/* Menu */}
      <div className="flex-1">
        {loading ? (
          <div>
            {[1, 2, 3, 4].map((i) => <MenuItemSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {Object.entries(menuByCategory).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{category}</h2>
                </div>
                {items.map((item) => maker && (
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
          </>
        )}
      </div>

      {/* Cart CTA */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-nav z-40">
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
