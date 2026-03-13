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

      const [makerRes, ordersRes] = await Promise.all([
        supabase.from('food_makers').select('*').eq('user_id', user.id).single(),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      ])

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
      <div className="flex flex-col min-h-full bg-[#F5F4F2]">
        <div className="bg-white px-4 h-[60px] flex items-center border-b border-[#EBEBEB]">
          <div className="h-5 bg-[#EBEBEB] rounded w-20 animate-pulse" />
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
    <div className="flex flex-col min-h-full bg-[#F5F4F2]">
      <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] px-4 h-[60px] flex items-center justify-between">
        <h1 className="text-[18px] font-black text-[#111]">Account</h1>
        <Link href="/settings" className="w-9 h-9 rounded-xl bg-[#F5F4F2] flex items-center justify-center">
          <Settings size={17} className="text-[#666]" />
        </Link>
      </header>

      {/* Hero card */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-[#EBEBEB] p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#111] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {maker?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={maker.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-black">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-[#111] leading-tight">{maker?.display_name}</h2>
            <p className="text-xs text-[#999] mt-0.5 truncate">{email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="flex items-center gap-1 text-xs text-[#666] font-semibold">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                {maker?.avg_rating?.toFixed(1) ?? '—'}
              </span>
              <span className="text-[#DDD]">·</span>
              <span className="text-xs text-[#666]">{maker?.total_reviews ?? 0} reviews</span>
            </div>
          </div>
        </div>

        {/* Cuisine tags */}
        {(maker?.cuisine_tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[#F0F0F0]">
            {maker!.cuisine_tags.slice(0, 5).map((tag) => (
              <span key={tag} className="text-[11px] bg-[#F5F4F2] text-[#666] px-2.5 py-1 rounded-full font-medium border border-[#EBEBEB]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-3.5 text-center">
          <Package size={14} className="text-[#CCC] mx-auto mb-1.5" />
          <p className="font-black text-[#111] text-lg leading-none">{totalDelivered}</p>
          <p className="text-[10px] text-[#AAA] mt-1 font-medium">Deliveries</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-3.5 text-center">
          <Star size={14} className="text-[#CCC] mx-auto mb-1.5" />
          <p className="font-black text-[#111] text-lg leading-none">{maker?.avg_rating?.toFixed(1) ?? '—'}</p>
          <p className="text-[10px] text-[#AAA] mt-1 font-medium">Rating</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-3.5 text-center">
          <MapPin size={14} className="text-[#CCC] mx-auto mb-1.5" />
          <p className="font-black text-[#111] text-lg leading-none">{maker?.service_radius_km ?? '—'}</p>
          <p className="text-[10px] text-[#AAA] mt-1 font-medium">km radius</p>
        </div>
      </div>

      {/* Menu */}
      <div className="mx-4 mt-3 bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2]">
        <Link href="/earnings" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0">
            <TrendingUp size={15} className="text-[#666]" />
          </div>
          <span className="text-sm font-semibold text-[#111] flex-1">Earnings</span>
          <ChevronRight size={15} className="text-[#CCC]" />
        </Link>
        <Link href="/menu" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0">
            <Package size={15} className="text-[#666]" />
          </div>
          <span className="text-sm font-semibold text-[#111] flex-1">Manage Menu</span>
          <ChevronRight size={15} className="text-[#CCC]" />
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0">
            <Settings size={15} className="text-[#666]" />
          </div>
          <span className="text-sm font-semibold text-[#111] flex-1">Settings</span>
          <ChevronRight size={15} className="text-[#CCC]" />
        </Link>
      </div>

      {/* Sign out */}
      <div className="mx-4 mt-3 bg-white rounded-2xl border border-[#EBEBEB]">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3.5"
        >
          <div className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0">
            <LogOut size={15} className="text-[#666]" />
          </div>
          <span className="text-sm font-semibold text-[#111]">Sign Out</span>
        </button>
      </div>

      <div className="py-8 text-center">
        <p className="text-xs text-[#DDD]">Doornext Maker v1.0.0</p>
      </div>
    </div>
  )
}
