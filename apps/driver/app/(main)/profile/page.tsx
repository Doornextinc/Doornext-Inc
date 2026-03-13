'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Star, Package, TrendingUp, Camera, ChevronRight, Shield, AlertCircle, CheckCircle, Clock } from 'lucide-react'

type DriverProfile = {
  id: string; full_name: string; avatar_url: string | null; vehicle_type: string | null
  is_active: boolean; total_deliveries: number; avg_rating: number; kyc_status: string | null; phone: string | null
}

const VEHICLE_LABELS: Record<string, { emoji: string; label: string }> = {
  car:       { emoji: '🚗', label: 'Car' },
  motorbike: { emoji: '🏍️',  label: 'Motorbike' },
  bicycle:   { emoji: '🚲', label: 'Bicycle' },
  foot:      { emoji: '🚶', label: 'On Foot' },
}

const KYC_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  not_submitted: { label: 'Not Submitted', color: 'text-slate-400', icon: AlertCircle, bg: 'bg-slate-700' },
  pending_review: { label: 'Under Review', color: 'text-yellow-400', icon: Clock, bg: 'bg-yellow-500/10' },
  approved: { label: 'Verified', color: 'text-green-400', icon: CheckCircle, bg: 'bg-green-500/10' },
  rejected: { label: 'Rejected', color: 'text-red-400', icon: AlertCircle, bg: 'bg-red-500/10' },
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? null)

      const [profileRes, earningsRes] = await Promise.all([
        supabase.from('driver_profiles').select('*').eq('id', user.id).single(),
        supabase.from('orders').select('delivery_fee').eq('nexter_id', user.id).eq('status', 'delivered'),
      ])

      if (profileRes.data) setProfile(profileRes.data as DriverProfile)
      if (earningsRes.data) setTotalEarnings(earningsRes.data.reduce((s, d) => s + (d.delivery_fee ?? 0), 0))
      setLoading(false)
    }
    load()
  }, [router])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/driver/update-avatar', { method: 'POST', body: fd })
      if (res.ok) {
        const { avatarUrl } = await res.json()
        setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev)
      }
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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

  const vehicle = profile?.vehicle_type ? VEHICLE_LABELS[profile.vehicle_type] : null
  const initials = (profile?.full_name ?? 'D')[0].toUpperCase()
  const kyc = KYC_CONFIG[profile?.kyc_status ?? 'not_submitted'] ?? KYC_CONFIG.not_submitted
  const KycIcon = kyc.icon

  return (
    <div className="flex flex-col min-h-full">
      {/* Hidden avatar input */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      {/* Hero header */}
      <div className="relative bg-gradient-to-b from-slate-700 to-slate-900 px-5 pt-12 pb-6">
        <div className="flex items-end gap-4">
          {/* Avatar with edit button */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center shadow-xl shadow-[#FF6B35]/20">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-3xl font-black">{initials}</span>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#FF6B35] rounded-full border-2 border-slate-900 flex items-center justify-center shadow-lg"
            >
              <Camera size={12} className="text-white" />
            </button>
            {profile?.is_active && (
              <div className="absolute -top-1 -left-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
            )}
          </div>

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
          <div className="flex items-center justify-center gap-1 mb-1"><Package size={13} className="text-[#FF6B35]" /></div>
          <p className="font-black text-white text-xl">{profile?.total_deliveries ?? 0}</p>
          <p className="text-[10px] text-slate-500">Deliveries</p>
        </div>
        <div className="text-center border-x border-slate-700/50">
          <div className="flex items-center justify-center gap-1 mb-1"><Star size={13} className="text-yellow-400" /></div>
          <p className="font-black text-white text-xl">{profile?.avg_rating?.toFixed(1) ?? '—'}</p>
          <p className="text-[10px] text-slate-500">Rating</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1"><TrendingUp size={13} className="text-green-400" /></div>
          <p className="font-black text-white text-xl">{totalEarnings !== null ? `$${totalEarnings.toFixed(0)}` : '—'}</p>
          <p className="text-[10px] text-slate-500">Earned</p>
        </div>
      </div>

      {/* KYC status */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">Verification</p>
        <div className={`${kyc.bg} rounded-2xl border border-slate-700/40 p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KycIcon size={20} className={kyc.color} />
              <div>
                <p className="font-bold text-white text-sm">Identity Verification</p>
                <p className={`text-xs mt-0.5 ${kyc.color}`}>{kyc.label}</p>
              </div>
            </div>
            {(profile?.kyc_status === 'not_submitted' || profile?.kyc_status === 'rejected') && (
              <button onClick={() => router.push('/onboarding')} className="flex items-center gap-1 text-xs font-bold text-[#FF6B35]">
                {profile.kyc_status === 'rejected' ? 'Resubmit' : 'Start'} <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account menu */}
      <div className="mx-4 mt-5 space-y-4">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-1">Account</p>
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
          {profile?.phone && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">📱</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Phone</p>
                <p className="text-xs text-slate-400">{profile.phone}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700/40 divide-y divide-slate-700/30">
          <button onClick={() => router.push('/earnings')} className="w-full flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-green-400" />
            </div>
            <span className="text-sm font-semibold text-white flex-1 text-left">Earnings & Payouts</span>
            <ChevronRight size={16} className="text-slate-600" />
          </button>
          <button onClick={() => router.push('/history')} className="w-full flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Package size={16} className="text-blue-400" />
            </div>
            <span className="text-sm font-semibold text-white flex-1 text-left">Delivery History</span>
            <ChevronRight size={16} className="text-slate-600" />
          </button>
          <button onClick={() => router.push('/onboarding')} className="w-full flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-[#FF6B35]" />
            </div>
            <span className="text-sm font-semibold text-white flex-1 text-left">KYC & Documents</span>
            <ChevronRight size={16} className="text-slate-600" />
          </button>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700/40">
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-4">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <LogOut size={16} className="text-red-400" />
            </div>
            <span className="text-sm font-bold text-red-400">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="py-8 text-center">
        <p className="text-[11px] text-slate-700">Doornext Driver v1.0.0</p>
      </div>
    </div>
  )
}
