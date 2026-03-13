'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

interface MakerInfo {
  id: string
  display_name: string
  cuisine_tags: string[]
  avg_rating: number
  total_reviews: number
  is_open: boolean
}

interface FavoriteMaker {
  id: string
  maker_id: string
  food_maker: MakerInfo | null
}

export default function FavoritesPage() {
  const router = useRouter()
  const [favorites, setFavorites] = useState<FavoriteMaker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('favorites')
        .select('id, maker_id, food_maker:food_makers(id, display_name, cuisine_tags, avg_rating, total_reviews, is_open)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setFavorites((data as FavoriteMaker[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  const handleUnfavorite = async (favoriteId: string) => {
    const supabase = createClient()
    await supabase.from('favorites').delete().eq('id', favoriteId)
    setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Favorite Makers" />

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart size={48} className="text-gray-200 mb-4" />
          <h3 className="text-lg font-bold text-gray-700">No favorites yet</h3>
          <p className="text-gray-400 text-sm mt-1">Save your favorite makers to order quickly</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {favorites.map((fav) => {
            const maker = fav.food_maker
            if (!maker) return null
            return (
              <div key={fav.id} className="bg-white rounded-2xl px-4 py-4 flex items-center gap-3">
                <Link href={`/maker/${maker.id}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center text-white text-xl font-black">
                      {maker.display_name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{maker.display_name}</p>
                      <p className="text-xs text-gray-400">{maker.cuisine_tags.slice(0, 2).join(' · ')}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-yellow-500">★</span>
                        <span className="text-xs font-semibold text-gray-700">{maker.avg_rating.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({maker.total_reviews})</span>
                        {maker.is_open && (
                          <span className="ml-1 text-xs text-green-500 font-semibold">Open</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => handleUnfavorite(fav.id)}
                  className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center"
                >
                  <Heart size={16} className="text-red-400 fill-red-400" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
