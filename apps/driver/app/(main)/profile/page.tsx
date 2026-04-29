'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import {
  Camera, ChevronRight, ChevronDown, LogOut, Lock,
  Mail, MessageCircle, Phone, Bell, Volume2, DollarSign,
  Navigation, Check, X, Star, TrendingUp, Package, Pencil,
  AlertCircle, CheckCircle, Clock, FileText, MapPin,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DriverProfile = {
  id: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  vehicle_type: string | null
  is_active: boolean
  kyc_status: string | null
  total_deliveries: number
  avg_rating: number | null
  acceptance_rate: number | null
  on_time_delivery_rate: number | null
  issues_reported: number
  created_at: string | null
}

type NavProvider = 'google' | 'apple' | 'waze'

// ─────────────────────────────────────────────────────────────────────────────
// KYC config
// ─────────────────────────────────────────────────────────────────────────────

const KYC_CONFIG: Record<string, { label: string; color: string; dot: string; icon: React.ElementType }> = {
  not_submitted:  { label: 'Not Submitted', color: 'text-zinc-400',  dot: 'bg-zinc-500',  icon: AlertCircle  },
  pending_review: { label: 'Under Review',  color: 'text-amber-400', dot: 'bg-amber-400', icon: Clock        },
  approved:       { label: 'Verified',      color: 'text-green-400', dot: 'bg-green-400', icon: CheckCircle  },
  rejected:       { label: 'Rejected',      color: 'text-red-400',   dot: 'bg-red-400',   icon: AlertCircle  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared components (identical to settings page style)
// ─────────────────────────────────────────────────────────────────────────────

function SettingRow({
  icon: Icon,
  label,
  sublabel,
  right,
  onClick,
  href,
  destructive = false,
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  right?: React.ReactNode
  onClick?: () => void
  href?: string
  destructive?: boolean
}) {
  const inner = (
    <span className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors">
      <span className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={destructive ? 'text-red-400' : 'text-zinc-400'} />
      </span>
      <span className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold ${destructive ? 'text-red-400' : 'text-white'}`}>{label}</p>
        {sublabel && <p className="text-xs text-zinc-500 mt-0.5 truncate">{sublabel}</p>}
      </span>
      {right !== undefined
        ? right
        : (onClick || href) ? <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" /> : null}
    </span>
  )

  if (href) return <a href={href} className="block">{inner}</a>
  if (onClick) return <button type="button" className="w-full text-left" onClick={onClick}>{inner}</button>
  return <div className="w-full">{inner}</div>
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-[#FF7A50]' : 'bg-[#2A2A2A]'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-1 mb-2 group"
    >
      <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest group-active:text-zinc-400 transition-colors">
        {label}
      </p>
      <ChevronDown size={14} className={`text-zinc-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

function SectionLabel({ label }: { label: string }) {
  return <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest mb-2 px-1">{label}</p>
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const router      = useRouter()
  const activeOrderId = useDriverStore((s) => s.activeOrderId)
  const clearStore  = useDriverStore((s) => s.clearStore)
  const userId      = useDriverStore((s) => s.userId)
  const userEmail   = useDriverStore((s) => s.userEmail)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady   = useDriverStore((s) => s.authReady)

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile]           = useState<DriverProfile | null>(null)
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null)
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null)
  const [completionRate, setCompletionRate] = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [toggling, setToggling]         = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editing, setEditing]       = useState(false)
  const [editName, setEditName]     = useState('')
  const [editPhone, setEditPhone]   = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  // ── App preferences (localStorage) ───────────────────────────────────────
  const [navProvider, setNavProvider]   = useState<NavProvider>('google')
  const [pushNotifs, setPushNotifs]     = useState(true)
  const [requestSounds, setRequestSounds] = useState(true)
  const [earningsAlerts, setEarningsAlerts] = useState(true)

  // ── Collapsible sections ──────────────────────────────────────────────────
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen]   = useState(false)
  const [deliveryOpen, setDeliveryOpen]       = useState(false)
  const [prefsOpen, setPrefsOpen]             = useState(false)
  const [supportOpen, setSupportOpen]         = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Auth guard + data load
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    // Load localStorage preferences
    const nav = localStorage.getItem('driver_nav_provider') as NavProvider | null
    const push = localStorage.getItem('driver_push_notifs')
    const sounds = localStorage.getItem('driver_request_sounds')
    const earnings = localStorage.getItem('driver_earnings_alerts')
    if (nav) setNavProvider(nav)
    if (push !== null) setPushNotifs(push === 'true')
    if (sounds !== null) setRequestSounds(sounds === 'true')
    if (earnings !== null) setEarningsAlerts(earnings === 'true')

    async function load() {
      const supabase = createClient()

      const [profileRes, ordersRes, earningsRes] = await Promise.all([
        supabase
          .from('driver_profiles')
          .select('id, full_name, phone, avatar_url, vehicle_type, is_active, kyc_status, total_deliveries, avg_rating, acceptance_rate, on_time_delivery_rate, issues_reported, created_at')
          .eq('id', userId)
          .single(),
        supabase
          .from('orders')
          .select('status')
          .eq('nexter_id', userId)
          .in('status', ['delivered', 'failed_delivery']),
        supabase
          .from('orders')
          .select('driver_payout')
          .eq('nexter_id', userId)
          .eq('status', 'delivered'),
      ])

      if (profileRes.data) {
        const p = profileRes.data as DriverProfile
        setProfile(p)
        setEditName(p.full_name ?? '')
        setEditPhone(p.phone ?? '')

        if (p.avatar_url && !p.avatar_url.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(p.avatar_url, 3600)
          setAvatarDisplayUrl(signed?.signedUrl ?? null)
        } else {
          setAvatarDisplayUrl(p.avatar_url)
        }
      }

      if (ordersRes.data && ordersRes.data.length > 0) {
        const total     = ordersRes.data.length
        const delivered = ordersRes.data.filter((o) => o.status === 'delivered').length
        setCompletionRate(Math.round((delivered / total) * 100))
      }

      if (earningsRes.data) {
        setTotalEarnings(earningsRes.data.reduce((s, r) => s + (r.driver_payout ?? 0), 0))
      }

      setLoading(false)
    }

    load()
  }, [router, userId, authReady, hasHydrated])

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

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
        setProfile((prev) => prev ? { ...prev, avatar_url: storagePath } : prev)
      }
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const handleOnlineToggle = async (next: boolean) => {
    if (toggling) return
    setToggling(true)
    setProfile((prev) => prev ? { ...prev, is_active: next } : prev)
    try {
      await fetch('/api/driver/set-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: next }),
      })
    } catch {
      setProfile((prev) => prev ? { ...prev, is_active: !next } : prev)
    } finally {
      setToggling(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!userId) return
    setSavingProfile(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('driver_profiles')
        .update({ full_name: editName.trim(), phone: editPhone.trim() })
        .eq('id', userId)
      if (error) { setSaveError(error.message); return }
      setProfile((prev) => prev ? { ...prev, full_name: editName.trim(), phone: editPhone.trim() } : prev)
      setEditing(false)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSignOut = async () => {
    if (activeOrderId) {
      const ok = window.confirm('You have an active delivery. Signing out won\'t cancel it, but you\'ll need to log back in to complete it. Sign out anyway?')
      if (!ok) return
    }
    const supabase = createClient()
    if (userId) await supabase.from('driver_profiles').update({ is_active: false }).eq('id', userId)
    clearStore()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const setNavPersist = useCallback((p: NavProvider) => {
    setNavProvider(p)
    localStorage.setItem('driver_nav_provider', p)
  }, [])

  const setPushPersist = useCallback((v: boolean) => {
    setPushNotifs(v)
    localStorage.setItem('driver_push_notifs', String(v))
  }, [])

  const setSoundsPersist = useCallback((v: boolean) => {
    setRequestSounds(v)
    localStorage.setItem('driver_request_sounds', String(v))
  }, [])

  const setEarningsPersist = useCallback((v: boolean) => {
    setEarningsAlerts(v)
    localStorage.setItem('driver_earnings_alerts', String(v))
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Loading skeleton
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <AppHeader title="Account" />
        <div className="p-4 space-y-3">
          <div className="h-28 bg-[#141414] rounded-2xl animate-pulse" />
          <div className="h-20 bg-[#141414] rounded-2xl animate-pulse" />
          <div className="h-40 bg-[#141414] rounded-2xl animate-pulse" />
          <div className="h-32 bg-[#141414] rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────

  const initials  = (profile?.full_name ?? userEmail ?? 'D')[0].toUpperCase()
  const isOnline  = profile?.is_active ?? false
  const kyc       = KYC_CONFIG[profile?.kyc_status ?? 'not_submitted'] ?? KYC_CONFIG.not_submitted
  const KycIcon   = kyc.icon

  const memberSince = (() => {
    if (!profile?.created_at) return null
    const months = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    if (months < 1) return 'Less than a month'
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
    const yrs = Math.floor(months / 12); const rem = months % 12
    return rem === 0 ? `${yrs} yr${yrs !== 1 ? 's' : ''}` : `${yrs}y ${rem}m`
  })()

  const navLabels: Record<NavProvider, string> = {
    google: 'Google Maps',
    apple: 'Apple Maps',
    waze: 'Waze',
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Account" />

      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      <div className="px-4 pt-5 pb-10 space-y-5">

        {/* ── Profile card ─────────────────────────────────────────────────── */}
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">

          {/* Avatar + identity */}
          <div className="flex items-center gap-4 px-4 pt-4 pb-3">
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative rounded-2xl overflow-hidden bg-[#242424] border border-white/8 flex items-center justify-center active:scale-95 transition-transform"
                style={{ width: 72, height: 72 }}
              >
                {avatarDisplayUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarDisplayUrl} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-white text-2xl font-black">{initials}</span>
                }
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </button>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#FF7A50] rounded-full flex items-center justify-center shadow pointer-events-none">
                <Camera size={10} className="text-white" />
              </div>
            </div>

            {!editing ? (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-black text-white truncate">{profile?.full_name ?? 'Driver'}</p>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#242424] border border-white/8 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Pencil size={11} className="text-zinc-400" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{userEmail}</p>
                {profile?.phone && <p className="text-xs text-zinc-600 mt-0.5">{profile.phone}</p>}
              </div>
            ) : (
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-[#1E1E1E] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF7A50]/50 transition-colors"
                />
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full bg-[#1E1E1E] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF7A50]/50 transition-colors"
                />
                {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-[#FF7A50] rounded-xl text-xs font-bold text-white disabled:opacity-60 active:scale-95 transition-all"
                  >
                    {savingProfile
                      ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Check size={12} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setSaveError(null); setEditName(profile?.full_name ?? ''); setEditPhone(profile?.phone ?? '') }}
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-[#242424] border border-white/8 rounded-xl text-xs font-bold text-zinc-300 disabled:opacity-60 active:scale-95 transition-all"
                  >
                    <X size={12} /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="h-px bg-white/5" />
          <div className="grid grid-cols-3 divide-x divide-white/5 py-3">
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1"><Package size={13} className="text-zinc-600" /></div>
              <p className="font-black text-white text-lg leading-none">{profile?.total_deliveries ?? 0}</p>
              <p className="text-[10px] text-zinc-600 mt-1">Deliveries</p>
            </div>
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1"><Star size={13} className="text-zinc-600" /></div>
              <p className="font-black text-white text-lg leading-none">{profile?.avg_rating != null ? profile.avg_rating.toFixed(1) : '—'}</p>
              <p className="text-[10px] text-zinc-600 mt-1">Rating</p>
            </div>
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1"><TrendingUp size={13} className="text-zinc-600" /></div>
              <p className="font-black text-white text-lg leading-none">{totalEarnings !== null ? `$${totalEarnings.toFixed(0)}` : '—'}</p>
              <p className="text-[10px] text-zinc-600 mt-1">Earned</p>
            </div>
          </div>
        </div>

        {/* ── Status ───────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel label="Status" />
          <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
            <SettingRow
              icon={isOnline ? CheckCircle : AlertCircle}
              label="Available for Deliveries"
              sublabel={isOnline ? 'You are visible to incoming orders' : 'Go online to start accepting orders'}
              right={<Toggle value={isOnline} onChange={handleOnlineToggle} />}
            />
            <SettingRow
              icon={KycIcon}
              label="Identity Verification"
              sublabel={profile?.kyc_status === 'approved' ? 'Verified — eligible for payouts' : 'Verification required to receive payouts'}
              onClick={profile?.kyc_status !== 'approved' ? () => router.push('/documents') : undefined}
              right={
                <div className={`flex items-center gap-1.5 text-xs font-bold ${kyc.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${kyc.dot}`} />
                  {kyc.label}
                </div>
              }
            />
          </div>
        </div>

        {/* ── Performance (collapsible) ─────────────────────────────────── */}
        <div>
          <SectionHeader label="Performance" open={performanceOpen} onToggle={() => setPerformanceOpen((o) => !o)} />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${performanceOpen ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="py-4 text-center">
                  <p className={`font-black text-xl leading-none ${
                    profile?.acceptance_rate == null ? 'text-zinc-500'
                    : profile.acceptance_rate >= 80 ? 'text-green-400'
                    : profile.acceptance_rate >= 60 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {profile?.acceptance_rate != null ? `${Math.round(profile.acceptance_rate)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1.5 font-bold uppercase tracking-wide">Acceptance</p>
                </div>
                <div className="py-4 text-center">
                  <p className={`font-black text-xl leading-none ${
                    completionRate == null ? 'text-zinc-500'
                    : completionRate >= 90 ? 'text-green-400'
                    : completionRate >= 70 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {completionRate != null ? `${completionRate}%` : '—'}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1.5 font-bold uppercase tracking-wide">Completion</p>
                </div>
              </div>
              <div className="h-px bg-white/5" />
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="py-4 text-center">
                  <p className={`font-black text-xl leading-none ${
                    profile?.on_time_delivery_rate == null ? 'text-zinc-500'
                    : profile.on_time_delivery_rate >= 85 ? 'text-green-400'
                    : profile.on_time_delivery_rate >= 65 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {profile?.on_time_delivery_rate != null ? `${Math.round(profile.on_time_delivery_rate)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1.5 font-bold uppercase tracking-wide">On-Time</p>
                </div>
                <div className="py-4 text-center">
                  <p className={`font-black text-xl leading-none ${
                    (profile?.issues_reported ?? 0) === 0 ? 'text-green-400'
                    : (profile?.issues_reported ?? 0) <= 3 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {profile?.issues_reported ?? 0}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1.5 font-bold uppercase tracking-wide">Issues</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Lifetime Highlights (collapsible) ────────────────────────────── */}
        <div>
          <SectionHeader label="Lifetime Highlights" open={highlightsOpen} onToggle={() => setHighlightsOpen((o) => !o)} />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${highlightsOpen ? 'max-h-[160px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-white/5 py-5">
                <div className="text-center px-3">
                  <p className="font-black text-white text-3xl leading-none">{profile?.total_deliveries ?? 0}</p>
                  <p className="text-xs text-zinc-500 mt-2 font-semibold">Orders Delivered</p>
                </div>
                <div className="text-center px-3">
                  <p className="font-black text-white text-xl leading-none">{memberSince ?? '—'}</p>
                  <p className="text-xs text-zinc-500 mt-2 font-semibold">Time With Us</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Delivery (collapsible) ────────────────────────────────────────── */}
        <div>
          <SectionHeader label="Delivery" open={deliveryOpen} onToggle={() => setDeliveryOpen((o) => !o)} />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${deliveryOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
              <SettingRow
                icon={TrendingUp}
                label="Earnings & Payouts"
                sublabel={completionRate !== null ? `${completionRate}% completion rate` : undefined}
                onClick={() => router.push('/earnings')}
              />
              <SettingRow
                icon={Package}
                label="Delivery History"
                onClick={() => router.push('/history')}
              />
              <SettingRow
                icon={MapPin}
                label="GPS Tracking"
                onClick={() => router.push('/tracking')}
              />
              <SettingRow
                icon={FileText}
                label="Documents & KYC"
                sublabel={kyc.label}
                onClick={() => router.push('/documents')}
              />
            </div>
          </div>
        </div>

        {/* ── Preferences (collapsible) ─────────────────────────────────── */}
        <div>
          <SectionHeader label="Preferences" open={prefsOpen} onToggle={() => setPrefsOpen((o) => !o)} />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${prefsOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
                    <Navigation size={16} className="text-zinc-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">Navigation</p>
                    <p className="text-xs text-zinc-500">Default map app</p>
                  </div>
                  <span className="text-xs text-zinc-500">{navLabels[navProvider]}</span>
                </div>
                <div className="flex gap-2 pl-11">
                  {(['google', 'apple', 'waze'] as NavProvider[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNavPersist(p)}
                      className={`flex-1 h-8 rounded-xl text-xs font-bold transition-colors border ${
                        navProvider === p
                          ? 'bg-[#FF7A50] border-[#FF7A50] text-white'
                          : 'bg-[#1E1E1E] border-white/8 text-zinc-400 active:bg-[#2A2A2A]'
                      }`}
                    >
                      {navLabels[p].split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <SettingRow
                icon={Bell}
                label="Push Notifications"
                sublabel="Order alerts and updates"
                right={<Toggle value={pushNotifs} onChange={setPushPersist} />}
              />
              <SettingRow
                icon={Volume2}
                label="Delivery Request Sounds"
                sublabel="Audio alert for new orders"
                right={<Toggle value={requestSounds} onChange={setSoundsPersist} />}
              />
              <SettingRow
                icon={DollarSign}
                label="Earnings Summary Alerts"
                sublabel="Daily earnings notifications"
                right={<Toggle value={earningsAlerts} onChange={setEarningsPersist} />}
              />
            </div>
          </div>
        </div>

        {/* ── Support (collapsible) ─────────────────────────────────────── */}
        <div>
          <SectionHeader label="Support" open={supportOpen} onToggle={() => setSupportOpen((o) => !o)} />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${supportOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
              <SettingRow
                icon={Mail}
                label="Email Support"
                sublabel="support@doornext.com"
                href="mailto:support@doornext.com"
              />
              <SettingRow
                icon={MessageCircle}
                label="WhatsApp"
                sublabel="Chat with support"
                href="https://wa.me/15551234567"
              />
              <SettingRow
                icon={Phone}
                label="Call Support"
                sublabel="+1 (555) 123-4567"
                href="tel:+15551234567"
              />
            </div>
          </div>
        </div>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel label="Security" />
          <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
            <SettingRow
              icon={Lock}
              label="Change Password"
              sublabel="Update your login credentials"
              onClick={() => router.push('/forgot-password')}
            />
            <SettingRow
              icon={LogOut}
              label="Sign Out"
              destructive
              onClick={handleSignOut}
              right={null}
            />
          </div>
        </div>

        <div className="pt-2 text-center">
          <p className="text-[11px] text-zinc-800">Doornext Driver v1.0.0</p>
        </div>

      </div>
    </div>
  )
}
