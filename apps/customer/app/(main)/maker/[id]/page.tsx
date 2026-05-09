'use client'

import { useMemo, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Star, Clock, MapPin, MessageCircle, ChevronLeft, ShoppingCart } from 'lucide-react'
import { MenuItemCard } from '@/components/maker/menu-item-card'
import { VerifiedBadge } from '@/components/maker/verified-badge'
import { DietaryBadge } from '@/components/ui/badge'
import { MenuItemSkeleton } from '@/components/ui/skeleton'
import { useCartStore } from '@/store/cart'
import { createClient } from '@/lib/supabase/client'
import { formatDistance, formatTime, formatPriceDollars } from '@/lib/utils'
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
      <div className="relative w-full h-56 bg-gradient-to-br from-orange-100 to-amber-50 flex-shrink-0">
        {maker?.banner_url ? (
          <Image
            src={maker.banner_url}
            alt={maker.display_name}
            fill
            className="object-cover"
            sizes="(max-width: 430px) 100vw, 430px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-8xl">🍽️</span>
          </div>
        )}

        {/* Back button */}
        <button
          aria-label="Go back"
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm active:bg-white transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-800" strokeWidth={2.5} />
        </button>

        {/* Open/Closed pill */}
        {maker && (
          <div
            className={`absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm ${
              maker.is_open ? 'bg-green-500 text-white' : 'bg-black/60 text-white'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${maker.is_open ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
            {maker.is_open ? 'Open' : 'Closed'}
          </div>
        )}
      </div>

      {/* Maker Info */}
      <div className="px-4 pt-4 pb-4 border-b border-gray-100 bg-white">
        <div className="flex items-start gap-3">
          {/* Avatar — lifts above hero */}
          <div className="relative w-16 h-16 rounded-2xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0 -mt-10 border-[3px] border-white shadow-lg overflow-hidden">
            {maker?.avatar_url ? (
              <Image
                src={maker.avatar_url}
                alt={maker?.display_name ?? ''}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <span className="text-white text-2xl font-black">
                {(maker?.display_name?.[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            {loading ? (
              <div className="space-y-2">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-4 w-32" />
              </div>
            ) : (
              <>
                <h1 className="heading-lg text-gray-900">{maker?.display_name}</h1>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {maker?.cuisine_tags.map((tag) => (
                    <DietaryBadge key={tag} label={tag} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {maker?.bio && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              About {maker.display_name?.split(' ')[0] ?? 'this Maker'}&apos;s Kitchen
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">{maker.bio}</p>
          </div>
        )}

        {/* Trust panel — surfaces verification, time on platform, neighbors served. */}
        {maker?.approval_status === 'approved' && (
          <div className="mt-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 p-3">
            <div className="flex items-center gap-2 mb-2">
              <VerifiedBadge size="lg" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              {maker.created_at && (
                <span>
                  <span className="text-gray-400">Member since</span>{' '}
                  <span className="font-bold text-gray-700">
                    {new Date(maker.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </span>
              )}
              {maker.total_reviews > 0 && (
                <span>
                  <span className="text-gray-400">Served</span>{' '}
                  <span className="font-bold text-gray-700">
                    {maker.total_reviews} neighbor{maker.total_reviews !== 1 ? 's' : ''}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {maker && (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1">
              <Star size={14} className="text-yellow-400 fill-yellow-400" />
              <span className="font-bold text-gray-900 text-sm">{maker.avg_rating.toFixed(1)}</span>
              <span className="text-gray-400 text-xs">({maker.total_reviews})</span>
            </div>
            <span className="text-gray-200">|</span>
            <div className="flex items-center gap-1 text-gray-500 text-sm">
              <Clock size={13} strokeWidth={2} />
              <span>{formatTime(maker.prep_time_mins)}</span>
            </div>
            {maker.distance_km !== undefined && (
              <>
                <span className="text-gray-200">|</span>
                <div className="flex items-center gap-1 text-gray-500 text-sm">
                  <MapPin size={13} strokeWidth={2} />
                  <span>{formatDistance(maker.distance_km)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={() => router.push(`/chat?makerId=${id}`)}
          className="flex items-center gap-2 mt-3.5 text-sm text-[#FF6B35] font-semibold"
        >
          <MessageCircle size={15} strokeWidth={2} />
          Message {maker?.display_name?.split(' ')[0] ?? 'Maker'}
        </button>
      </div>

      {/* Menu */}
      <div className="flex-1 bg-[#f9fafb]">
        {loading ? (
          <div className="bg-white">
            {[1, 2, 3, 4].map((i) => <MenuItemSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {Object.entries(menuByCategory).map(([category, items]) => (
              <div key={category} className="mb-2">
                {/* Category header */}
                <div className="px-4 py-3 bg-white border-b border-gray-50">
                  <h2 className="label-sm text-gray-500">{category}</h2>
                </div>
                <div className="bg-white">
                  {items.map((item) => maker && (
                    <MenuItemCard key={item.id} item={item} maker={maker} />
                  ))}
                </div>
              </div>
            ))}
            {menuItems.length === 0 && (
              <div className="flex flex-col items-center py-20 text-center bg-white">
                <span className="text-5xl mb-4">🍽️</span>
                <p className="heading-md text-gray-400">Menu coming soon</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cart CTA — floats above bottom nav */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-nav z-40 pointer-events-none">
          <button
            onClick={() => router.push('/cart')}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 px-5 flex items-center justify-between shadow-cta active:bg-[#E55A24] transition-colors pointer-events-auto"
          >
            <div className="bg-white/25 rounded-xl w-8 h-8 flex items-center justify-center">
              <span className="text-sm font-bold tabular-nums">{cartCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} strokeWidth={2.25} />
              <span className="font-bold text-base">View Cart</span>
            </div>
            <span className="font-bold text-base">{formatPriceDollars(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
