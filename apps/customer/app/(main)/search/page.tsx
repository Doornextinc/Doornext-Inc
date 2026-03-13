'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MakerCard } from '@/components/home/maker-card'
import { haversineDistance } from '@/lib/utils'
import { FALLBACK_LAT, FALLBACK_LNG } from '@/lib/constants'
import type { FoodMaker, MenuItem } from '@/types'

interface DishResult {
  item: MenuItem
  maker: FoodMaker
}

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [makers, setMakers] = useState<FoodMaker[]>([])
  const [dishes, setDishes] = useState<DishResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setMakers([]); setDishes([]); setError(null); return }
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const term = `%${q.trim()}%`
      // cuisine_tags uses array containment; sanitize to avoid PostgREST injection via special chars
      const safeCuisineTag = q.trim().replace(/[{}\\]/g, '')

      const [makersRes, itemsRes] = await Promise.all([
        supabase
          .from('food_makers')
          .select('*')
          .or(`display_name.ilike.${term},bio.ilike.${term}${safeCuisineTag ? `,cuisine_tags.cs.{${safeCuisineTag}}` : ''}`)
          .limit(10),
        supabase
          .from('menu_items')
          .select('*, food_maker:food_makers(*)')
          .or(`name.ilike.${term},description.ilike.${term}`)
          .eq('is_available', true)
          .limit(20),
      ])

      const makersWithDist = (makersRes.data ?? []).map((m) => ({
        ...m,
        distance_km: parseFloat(haversineDistance(FALLBACK_LAT, FALLBACK_LNG, m.lat, m.lng).toFixed(1)),
      }))
      setMakers(makersWithDist as FoodMaker[])

      const dishResults: DishResult[] = (itemsRes.data ?? []).map((row) => ({
        item: { ...row, food_maker: undefined } as MenuItem,
        maker: row.food_maker as FoodMaker,
      })).filter((r) => r.maker)
      setDishes(dishResults)
    } catch (e) {
      console.error('Search failed:', e)
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { doSearch(query) }, 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const hasResults = makers.length > 0 || dishes.length > 0

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      {/* Search bar */}
      <div className="bg-white px-4 pt-4 pb-3 sticky top-0 z-10 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900 mb-3">Search</h1>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food makers or dishes..."
            className="w-full bg-gray-100 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-gray-50 focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🔍</span>
            <p className="text-gray-400 text-sm">Search for food makers or dishes</p>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />)}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">⚠️</span>
            <h3 className="text-lg font-bold text-gray-700">Search failed</h3>
            <p className="text-gray-400 text-sm mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && query.trim() && !hasResults && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">😔</span>
            <h3 className="text-lg font-bold text-gray-700">No results</h3>
            <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
          </div>
        )}

        {!loading && makers.length > 0 && (
          <section className="mb-6">
            <h2 className="font-bold text-gray-700 text-sm mb-3">Food Makers ({makers.length})</h2>
            <div className="space-y-4">
              {makers.map((maker) => <MakerCard key={maker.id} maker={maker} />)}
            </div>
          </section>
        )}

        {!loading && dishes.length > 0 && (
          <section>
            <h2 className="font-bold text-gray-700 text-sm mb-3">Dishes ({dishes.length})</h2>
            <div className="space-y-3">
              {dishes.map(({ item, maker }) => (
                <button
                  key={item.id}
                  onClick={() => router.push(`/maker/${maker.id}`)}
                  className="w-full bg-white rounded-xl p-3 flex gap-3 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    <p className="text-xs text-gray-400 truncate">{maker.display_name}</p>
                    {item.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                    )}
                    <p className="text-sm font-bold text-[#FF6B35] mt-1">${item.price.toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
