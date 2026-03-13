'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FoodMaker } from '@doornext/shared/types'
import { LogOut, Star, MapPin } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const [maker, setMaker] = useState<FoodMaker | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('food_makers').select('*').eq('user_id', user.id).single()
      if (data) setMaker(data)
      setLoading(false)
    }
    load()
  }, [router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <div className="bg-white px-4 py-6 mb-3 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-200" />
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-24" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center">
        <h1 className="text-lg font-bold text-gray-900">My Profile</h1>
      </header>

      {/* Maker info */}
      <div className="bg-white px-4 py-6 mb-3">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center flex-shrink-0">
            {maker?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={maker.avatar_url} alt="" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <span className="text-white text-2xl font-black">
                {(maker?.display_name?.[0] ?? 'M').toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">{maker?.display_name}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Star size={13} className="text-yellow-400 fill-yellow-400" />
                {maker?.avg_rating.toFixed(1)} ({maker?.total_reviews} reviews)
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {maker?.cuisine_tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-xs bg-orange-50 text-[#FF6B35] px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        {maker?.bio && (
          <p className="text-sm text-gray-500 mt-4 leading-relaxed">{maker.bio}</p>
        )}
      </div>

      {/* Location */}
      <div className="bg-white mb-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <MapPin size={16} className="text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Service Area</p>
            <p className="text-xs text-gray-400">
              {maker?.service_radius_km}km radius
            </p>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className="bg-white mb-3">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-4"
        >
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <LogOut size={18} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-red-500">Sign Out</p>
        </button>
      </div>

      <div className="px-4 py-6 text-center">
        <p className="text-xs text-gray-300">Doornext Maker v1.0.0</p>
      </div>
    </div>
  )
}
