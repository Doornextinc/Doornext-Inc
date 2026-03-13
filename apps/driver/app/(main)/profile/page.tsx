'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DriverProfile } from '@doornext/shared/types'
import { LogOut, Star, Package, TrendingUp } from 'lucide-react'

const VEHICLE_LABELS: Record<string, { emoji: string; label: string }> = {
  car: { emoji: '🚗', label: 'Car' },
  bike: { emoji: '🚲', label: 'Bicycle' },
  foot: { emoji: '🚶', label: 'On Foot' },
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? null)

      const [profileRes, earningsRes] = await Promise.all([
        supabase.from('driver_profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('orders')
          .select('delivery_fee')
          .eq('nexter_id', user.id)
          .eq('status', 'delivered'),
      ])

      if (profileRes.data) setProfile(profileRes.data as DriverProfile)
      if (earningsRes.data) {
        setTotalEarnings(earningsRes.data.reduce((s, d) => s + (d.delivery_fee ?? 0), 0))
      }
      setLoading(false)
    }
    load()
  }, [router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const vehicle = profile?.vehicle_type ? VEHICLE_LABELS[profile.vehicle_type] : null
  const initials = (profile?.full_name ?? 'D')[0].toUpperCase()

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="h-48 bg-slate-800 animate-pulse" />
        <div className="p-4 space-y-3">
          <div className="h-24 bg-slate-800 rounded-2xl animate-pulse" />
          <div className="h-40 bg-slate-800 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Hero gradient header */}
      <div className="relative bg-gradient-to-b from-slate-700 to-slate-900 px-5 pt-10 pb-6">
        <div className="flex items-end gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center shadow-xl shadow-[#FF6B35]/20">
              <span className="text-white text-3xl font-black">{initials}</span>
            </div>
            {profile?.is_active && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-900" />
            )}
          </div>

          {/* Name & email */}
          <div className="flex-1 pb-1">
            <h1 className="text-xl font-black text-white leading-tight">{profile?.full_name ?? 'Driver'}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{email}</p>
            {vehicle && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-slate-400 bg-slate-700/60 rounded-full px-2.5 py-0.5">
                {vehicle.emoji} {vehicle.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mx-4 -mt-2 bg-slate-800 rounded-2xl border border-slate-700/40 p-4 grid grid-cols-3 gap-4 shadow-lg">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Package size={13} className="text-[#FF6B35]" />
          </div>
          <p className="font-black text-white text-xl">{profile?.total_deliveries ?? 0}</p>
          <p className="text-[10px] text-slate-500">Deliveries</p>
        </div>
        <div className="text-center border-x border-slate-700/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Star size={13} className="text-yellow-400" />
          </div>
          <p className="font-black text-white text-xl">{profile?.avg_rating?.toFixed(1) ?? '—'}</p>
          <p className="text-[10px] text-slate-500">Rating</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp size={13} className="text-green-400" />
          </div>
          <p className="font-black text-white text-xl">
            {totalEarnings !== null ? `$${totalEarnings.toFixed(0)}` : '—'}
          </p>
          <p className="text-[10px] text-slate-500">Earned</p>
        </div>
      </div>

      {/* Menu sections */}
      <div className="mx-4 mt-5 space-y-4">
        {/* Account section */}
        <section>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">Account</p>
          <div className="bg-slate-800 rounded-2xl border border-slate-700/40 divide-y divide-slate-700/30">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">{vehicle?.emoji ?? '🚗'}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Vehicle</p>
                <p className="text-xs text-slate-400">{vehicle?.label ?? 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">✉️</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Email</p>
                <p className="text-xs text-slate-400">{email}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <div className="bg-slate-800 rounded-2xl border border-slate-700/40">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-4"
            >
              <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <LogOut size={16} className="text-red-400" />
              </div>
              <span className="text-sm font-bold text-red-400">Sign Out</span>
            </button>
          </div>
        </section>
      </div>

      <div className="py-8 text-center">
        <p className="text-[11px] text-slate-700">Doornext Driver v1.0.0</p>
      </div>
    </div>
  )
}
