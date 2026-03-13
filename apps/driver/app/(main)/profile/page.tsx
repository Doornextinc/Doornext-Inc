'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DriverProfile } from '@doornext/shared/types'
import { LogOut, Star, Truck } from 'lucide-react'

const VEHICLE_ICONS: Record<string, string> = { car: '🚗', bike: '🚲', foot: '🚶' }

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? null)
      const { data } = await supabase
        .from('driver_profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data as DriverProfile)
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
      <div className="flex flex-col min-h-full bg-slate-900">
        <div className="px-4 py-6 animate-pulse space-y-4">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-full bg-slate-700" />
            <div className="space-y-2">
              <div className="h-5 bg-slate-700 rounded w-32" />
              <div className="h-4 bg-slate-700 rounded w-24" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 h-14 flex items-center">
        <h1 className="text-lg font-black text-white">Profile</h1>
      </header>

      {/* Avatar & name */}
      <div className="bg-slate-800 mx-4 mt-4 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
            <span className="text-white text-2xl font-black">
              {(profile?.full_name?.[0] ?? 'D').toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-black text-white">{profile?.full_name ?? 'Driver'}</h2>
            <p className="text-sm text-slate-400">{email}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <Star size={16} className="text-yellow-400 fill-yellow-400" />
            <span className="font-bold text-white">{profile?.avg_rating?.toFixed(1) ?? '—'}</span>
            <span className="text-xs text-slate-400">rating</span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <Truck size={16} className="text-[#FF6B35]" />
            <span className="font-bold text-white">{profile?.total_deliveries ?? 0}</span>
            <span className="text-xs text-slate-400">deliveries</span>
          </div>
          {profile?.vehicle_type && (
            <>
              <div className="w-px h-4 bg-slate-700" />
              <span className="text-lg">{VEHICLE_ICONS[profile.vehicle_type]}</span>
            </>
          )}
        </div>
      </div>

      {/* Sign out */}
      <div className="mx-4 mt-4 bg-slate-800 rounded-2xl border border-slate-700/50">
        <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
            <LogOut size={18} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-red-400">Sign Out</p>
        </button>
      </div>

      <div className="py-8 text-center">
        <p className="text-xs text-slate-600">Doornext Driver v1.0.0</p>
      </div>
    </div>
  )
}
