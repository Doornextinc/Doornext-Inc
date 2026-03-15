'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  User, MapPin, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, Heart, Star, Settings,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
  id: string
  full_name: string
  email: string | null
  avatar_url: string | null
  created_at: string
}

interface ProfileItemProps {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
  danger?: boolean
}

function ProfileItem({ icon, label, value, onClick, danger }: ProfileItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          danger ? 'bg-red-50' : 'bg-gray-100'
        }`}
      >
        <div className={`${danger ? 'text-red-500' : 'text-gray-600'}`}>{icon}</div>
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold ${danger ? 'text-red-500' : 'text-gray-900'}`}>
          {label}
        </p>
        {value && <p className="text-xs text-gray-400 mt-0.5 truncate">{value}</p>}
      </div>
      <ChevronRight size={15} className="text-gray-300 flex-shrink-0" strokeWidth={2.5} />
    </button>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState({ orders: 0, favorites: 0, reviews: 0 })
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [profileRes, ordersRes, favRes, reviewsRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', user.id),
        supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('customer_id', user.id),
      ])

      if (profileRes.data) {
        setProfile({
          id: user.id,
          full_name: profileRes.data.full_name || user.email?.split('@')[0] || 'Customer',
          email: profileRes.data.email || user.email,
          avatar_url: profileRes.data.avatar_url,
          created_at: profileRes.data.created_at,
        })
      }

      setStats({
        orders: ordersRes.count ?? 0,
        favorites: favRes.count ?? 0,
        reviews: reviewsRes.count ?? 0,
      })
    } catch (e) {
      console.error('Failed to load profile:', e)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadProfile() }, [loadProfile])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadProfile() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadProfile])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f9fafb]">
        <TopBar title="Profile" showCart={false} showNotifications={false} />
        <div className="bg-white px-4 py-6 mb-2 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-200 flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 rounded-lg w-36" />
              <div className="h-4 bg-gray-200 rounded-lg w-44" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f9fafb]">
      <TopBar title="Profile" showCart={false} showNotifications={false} />

      {/* Profile header */}
      <div className="bg-white px-4 py-5 mb-2 page-enter">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt="Profile photo"
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <span className="text-white text-2xl font-black">
                {(profile?.full_name?.[0] ?? 'U').toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="heading-lg text-gray-900 truncate">{profile?.full_name}</h2>
            <p className="text-sm text-gray-400 truncate">{profile?.email}</p>
            {memberSince && (
              <p className="text-xs text-gray-300 mt-0.5">Member since {memberSince}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mt-5">
          {[
            { label: 'Orders', value: stats.orders, color: 'text-[#FF6B35]' },
            { label: 'Favorites', value: stats.favorites, color: 'text-pink-500' },
            { label: 'Reviews', value: stats.reviews, color: 'text-yellow-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 bg-gray-50 rounded-2xl py-3.5 text-center">
              <p className={`font-black text-xl leading-tight ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Account section */}
      <div className="bg-white mb-2 divide-y divide-gray-50">
        <div className="px-4 pt-4 pb-2">
          <p className="label-sm text-gray-400">Account</p>
        </div>
        <ProfileItem
          icon={<User size={17} />}
          label="Personal Info"
          value={profile?.full_name}
          onClick={() => router.push('/profile/personal-info')}
        />
        <ProfileItem
          icon={<MapPin size={17} />}
          label="Saved Addresses"
          onClick={() => router.push('/profile/addresses')}
        />
        <ProfileItem
          icon={<CreditCard size={17} />}
          label="Payment Methods"
          onClick={() => router.push('/profile/payment')}
        />
      </div>

      {/* Preferences section */}
      <div className="bg-white mb-2 divide-y divide-gray-50">
        <div className="px-4 pt-4 pb-2">
          <p className="label-sm text-gray-400">Preferences</p>
        </div>
        <ProfileItem
          icon={<Heart size={17} />}
          label="Favorite Makers"
          value={`${stats.favorites} saved`}
          onClick={() => router.push('/profile/favorites')}
        />
        <ProfileItem
          icon={<Star size={17} />}
          label="My Reviews"
          value={`${stats.reviews} reviews`}
          onClick={() => router.push('/profile/reviews')}
        />
        <ProfileItem
          icon={<Bell size={17} />}
          label="Notifications"
          onClick={() => router.push('/notifications')}
        />
        <ProfileItem
          icon={<Settings size={17} />}
          label="App Settings"
          onClick={() => router.push('/profile/settings')}
        />
      </div>

      {/* Support section */}
      <div className="bg-white mb-2 divide-y divide-gray-50">
        <div className="px-4 pt-4 pb-2">
          <p className="label-sm text-gray-400">Support</p>
        </div>
        <ProfileItem
          icon={<HelpCircle size={17} />}
          label="Help & Support"
          onClick={() => router.push('/profile/help')}
        />
        <ProfileItem
          icon={<LogOut size={17} />}
          label="Sign Out"
          danger
          onClick={handleSignOut}
        />
      </div>

      <div className="px-4 py-8 text-center">
        <p className="text-xs text-gray-300 font-medium">Doornext v1.0.0 · © 2026 Doornext Inc.</p>
      </div>
    </div>
  )
}
