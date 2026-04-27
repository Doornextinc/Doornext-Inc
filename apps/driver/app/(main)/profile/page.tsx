'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import {
  LogOut, Star, Package, TrendingUp, Camera, ChevronRight,
  AlertCircle, CheckCircle, Clock, Settings, FileText, MapPin,
  Mail, MessageCircle, Pencil,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DriverProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  is_active: boolean
  total_deliveries: number
  avg_rating: number
  kyc_status: string | null
  phone: string | null
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const KYC_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  not_submitted: { label: 'Not Submitted', bg: 'bg-zinc-800',  text: 'text-zinc-400',  dot: 'bg-zinc-500',  icon: AlertCircle },
  pending_review: { label: 'Under Review',  bg: 'bg-amber-950', text: 'text-amber-400', dot: 'bg-amber-400', icon: Clock },
  approved:        { label: 'Verified',      bg: 'bg-green-950', text: 'text-green-400', dot: 'bg-green-400', icon: CheckCircle },
  rejected:        { label: 'Rejected',      bg: 'bg-red-950',   text: 'text-red-400',   dot: 'bg-red-400',   icon: AlertCircle },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest mb-2 px-1">
      {label}
    </p>
  )
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  href,
}: {
  icon: React.ElementType
  label: string
  onPress?: () => void
  href?: string
}) {
  const inner = (
    <span className="flex items-center gap-3 px-4 py-3.5 w-full active:bg-white/5 transition-colors">
      <span className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-zinc-400" />
      </span>
      <span className="text-sm font-semibold text-white flex-1 text-left">{label}</span>
      <ChevronRight size={16} className="text-zinc-700" />
    </span>
  )

  if (href) {
    return (
      <a href={href} className="block">
        {inner}
      </a>
    )
  }

  return (
    <button className="w-full text-left" onClick={onPress}>
      {inner}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const router = useRouter()
  const activeOrderId = useDriverStore((s) => s.activeOrderId)
  const clearStore    = useDriverStore((s) => s.clearStore)
  const userId        = useDriverStore((s) => s.userId)
  const userEmail     = useDriverStore((s) => s.userEmail)
  const hasHydrated   = useDriverStore((s) => s._hasHydrated)
  const authReady     = useDriverStore((s) => s.authReady)

  const [profile, setProfile]               = useState<DriverProfile | null>(null)
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null)
  const [totalEarnings, setTotalEarnings]   = useState<number | null>(null)
  const [loading, setLoading]               = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [toggling, setToggling]             = useState(false)

  const avatarInputRef = useRef<HTMLInputElement>(null)

  // -------------------------------------------------------------------------
  // Auth guard + data load
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    async function load() {
      const supabase = createClient()

      const [profileRes, earningsRes] = await Promise.all([
        supabase
          .from('driver_profiles')
          .select('id, full_name, phone, avatar_url, is_active, total_deliveries, avg_rating, kyc_status')
          .eq('id', userId)
          .single(),
        supabase
          .from('orders')
          .select('driver_payout')
          .eq('nexter_id', userId)
          .eq('status', 'delivered'),
      ])

      if (profileRes.data) {
        const p = profileRes.data as DriverProfile
        setProfile(p)
        // avatar_url stores the storage path; generate a short-lived signed URL
        if (p.avatar_url && !p.avatar_url.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(p.avatar_url, 3600)
          setAvatarDisplayUrl(signed?.signedUrl ?? null)
        } else {
          setAvatarDisplayUrl(p.avatar_url)
        }
      }

      if (earningsRes.data) {
        setTotalEarnings(
          earningsRes.data.reduce((sum, row) => sum + (row.driver_payout ?? 0), 0)
        )
      }

      setLoading(false)
    }

    load()
  }, [router, userId, authReady, hasHydrated])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/driver/update-avatar', { method: 'POST', body: fd })
      if (res.ok) {
        const { avatarUrl, storagePath } = await res.json()
        setAvatarDisplayUrl(avatarUrl)
        setProfile(prev => prev ? { ...prev, avatar_url: storagePath } : prev)
      }
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleOnlineToggle = async () => {
    if (!profile || toggling) return
    const next = !profile.is_active
    setToggling(true)
    // Optimistic update
    setProfile(prev => prev ? { ...prev, is_active: next } : prev)
    try {
      await fetch('/api/driver/set-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: next }),
      })
    } catch {
      // Revert on failure
      setProfile(prev => prev ? { ...prev, is_active: !next } : prev)
    } finally {
      setToggling(false)
    }
  }

  const handleSignOut = async () => {
    if (activeOrderId) {
      const confirmed = window.confirm(
        'You have an active delivery in progress. Signing out will not cancel your order, but you must log back in to complete it. Sign out anyway?'
      )
      if (!confirmed) return
    }
    const supabase = createClient()
    if (userId) {
      await supabase.from('driver_profiles').update({ is_active: false }).eq('id', userId)
    }
    clearStore()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-full bg-[#080808]">
        <div className="mx-4 mt-4 h-52 bg-[#141414] rounded-3xl animate-pulse" />
        <div className="mx-4 mt-3 h-10 bg-[#141414] rounded-2xl animate-pulse" />
        <div className="mx-4 mt-5 h-36 bg-[#141414] rounded-2xl animate-pulse" />
        <div className="mx-4 mt-5 h-36 bg-[#141414] rounded-2xl animate-pulse" />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const initials  = (profile?.full_name ?? 'D')[0].toUpperCase()
  const kyc       = KYC_CONFIG[profile?.kyc_status ?? 'not_submitted'] ?? KYC_CONFIG.not_submitted
  const KycIcon   = kyc.icon
  const isOnline  = profile?.is_active ?? false

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-full bg-[#080808] pb-safe">
      {/* Hidden file input */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero card                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-[#141414] rounded-3xl border border-white/5 mx-4 mt-4 p-5">
        {/* Top row: avatar + name */}
        <div className="flex items-start gap-4">
          {/* Avatar with camera badge */}
          <div className="relative flex-shrink-0">
            <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden bg-[#242424] border border-white/8 flex items-center justify-center">
              {avatarDisplayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarDisplayUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-black">{initials}</span>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            {/* Camera badge */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-[#FF7A50] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <Camera size={11} className="text-white" />
            </button>
          </div>

          {/* Name + email + phone */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white leading-tight truncate">
                {profile?.full_name ?? 'Driver'}
              </h1>
              <button className="flex-shrink-0 active:opacity-60 transition-opacity">
                <Pencil size={13} className="text-zinc-600" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{userEmail}</p>
            {profile?.phone && (
              <p className="text-xs text-zinc-600 mt-0.5">{profile.phone}</p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 mt-4 mb-0" />

        {/* Stats row */}
        <div className="grid grid-cols-3 pt-4">
          {/* Deliveries */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-1.5">
              <Package size={13} className="text-zinc-600" />
            </div>
            <p className="font-black text-white text-xl leading-none">
              {profile?.total_deliveries ?? 0}
            </p>
            <p className="text-[11px] text-zinc-600 mt-1">Deliveries</p>
          </div>

          {/* Rating */}
          <div className="text-center border-x border-white/5">
            <div className="flex items-center justify-center mb-1.5">
              <Star size={13} className="text-zinc-600" />
            </div>
            <p className="font-black text-white text-xl leading-none">
              {profile?.avg_rating != null ? profile.avg_rating.toFixed(1) : '—'}
            </p>
            <p className="text-[11px] text-zinc-600 mt-1">Rating</p>
          </div>

          {/* Earned */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-1.5">
              <TrendingUp size={13} className="text-zinc-600" />
            </div>
            <p className="font-black text-white text-xl leading-none">
              {totalEarnings !== null ? `$${totalEarnings.toFixed(0)}` : '—'}
            </p>
            <p className="text-[11px] text-zinc-600 mt-1">Earned</p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Status row                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center mx-4 mt-3 gap-2">
        {/* Online / Offline pill */}
        <button
          onClick={handleOnlineToggle}
          disabled={toggling}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-bold transition-colors active:scale-95 ${
            isOnline
              ? 'bg-green-950 border-green-800 text-green-400'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isOnline ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'
            }`}
          />
          {isOnline ? 'Online' : 'Offline'}
        </button>

        {/* KYC status chip */}
        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold ${kyc.bg} ${kyc.text} border-white/5`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${kyc.dot}`} />
          {kyc.label}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Section: Delivery                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-4 mt-5">
        <SectionLabel label="Delivery" />
        <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          <MenuRow icon={TrendingUp} label="Earnings & Payouts" onPress={() => router.push('/earnings')} />
          <MenuRow icon={Package}    label="Delivery History"   onPress={() => router.push('/history')} />
          <MenuRow icon={MapPin}     label="GPS Tracking"       onPress={() => router.push('/tracking')} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Section: Account                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-4 mt-5">
        <SectionLabel label="Account" />
        <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          <MenuRow icon={FileText} label="Documents & KYC" onPress={() => router.push('/documents')} />
          <MenuRow icon={Settings} label="App Settings"    onPress={() => router.push('/settings')} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Section: Support                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-4 mt-5">
        <SectionLabel label="Support" />
        <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          <MenuRow icon={Mail}          label="Email Support" href="mailto:support@doornext.com" />
          <MenuRow icon={MessageCircle} label="Messages"      onPress={() => router.push('/messages')} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Sign Out                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-4 mt-5">
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors"
          >
            <span className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
              <LogOut size={16} className="text-red-400" />
            </span>
            <span className="text-sm font-bold text-red-400 flex-1 text-left">Sign Out</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Version footer                                                    */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-[11px] text-zinc-800 text-center py-8">
        Doornext Driver v1.0.0
      </p>
    </div>
  )
}
