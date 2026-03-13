'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FoodMaker } from '@doornext/shared/types'
import { LogOut, Star, MapPin, Settings, ChevronRight, Package, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const [maker, setMaker] = useState<FoodMaker | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [totalDelivered, setTotalDelivered] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? null)

      const makerRes = await supabase.from('food_makers').select('*').eq('user_id', user.id).single()
      const ordersRes = makerRes.data
        ? await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('maker_id', makerRes.data.id).eq('status', 'delivered')
        : { count: 0 }

      if (makerRes.data) setMaker(makerRes.data)
      setTotalDelivered(ordersRes.count ?? 0)
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
      <div className="flex flex-col min-h-full bg-gray-50">
        <div className="bg-white px-4 h-[60px] flex items-center border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded w-20 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          <div className="h-28 bg-white rounded-2xl animate-pulse" />
          <div className="h-40 bg-white rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  const initials = (maker?.display_name?.[0] ?? 'M').toUpperCase()

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center justify-between">
        <h1 className="text-[18px] font-black text-gray-900">Account</h1>
        <Link href="/settings" className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center">
          <Settings size={17} className="text-gray-500" />
        </Link>
      </header>

      {/* Hero card */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md shadow-[#FF6B35]/25">
            {maker?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={maker.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-black">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-gray-900 leading-tight">{maker?.display_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="flex items-center gap-1 text-xs text-gray-600 font-semibold">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                {maker?.avg_rating?.toFixed(1) ?? '—'}
              </span>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400">{maker?.total_reviews ?? 0} reviews</span>
            </div>
          </div>
        </div>

        {/* Cuisine tags */}
        {(maker?.cuisine_tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {maker!.cuisine_tags.slice(0, 5).map((tag) => (
              <span key={tag} className="text-[11px] bg-orange-50 text-[#FF6B35] px-2.5 py-1 rounded-full font-semibold border border-orange-100">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <Package size={14} className="text-[#FF6B35] mx-auto mb-1.5" />
          <p className="font-black text-gray-900 text-lg leading-none">{totalDelivered}</p>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">Deliveries</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <Star size={14} className="text-amber-400 mx-auto mb-1.5" />
          <p className="font-black text-gray-900 text-lg leading-none">{maker?.avg_rating?.toFixed(1) ?? '—'}</p>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">Rating</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
          <MapPin size={14} className="text-[#FF6B35] mx-auto mb-1.5" />
          <p className="font-black text-gray-900 text-lg leading-none">{maker?.service_radius_km ?? '—'}</p>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">km radius</p>
        </div>
      </div>

      {/* Menu links */}
      <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        <Link href="/earnings" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={15} className="text-[#FF6B35]" />
          </div>
          <span className="text-sm font-semibold text-gray-900 flex-1">Earnings</span>
          <ChevronRight size={15} className="text-gray-300" />
        </Link>
        <Link href="/menu" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Package size={15} className="text-[#FF6B35]" />
          </div>
          <span className="text-sm font-semibold text-gray-900 flex-1">Manage Menu</span>
          <ChevronRight size={15} className="text-gray-300" />
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Settings size={15} className="text-[#FF6B35]" />
          </div>
          <span className="text-sm font-semibold text-gray-900 flex-1">Settings</span>
          <ChevronRight size={15} className="text-gray-300" />
        </Link>
      </div>

      {/* Sign out */}
      <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100">
        <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
            <LogOut size={15} className="text-gray-500" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Sign Out</span>
        </button>
      </div>

      <div className="py-8 text-center">
        <p className="text-xs text-gray-200">Doornext Maker v1.0.0</p>
      </div>
    </div>
  )
}
