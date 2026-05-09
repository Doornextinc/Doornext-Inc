'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore, useActiveOrderId } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import {
  Camera,
  ChevronRight,
  ChevronDown,
  LogOut,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Bell,
  Volume2,
  DollarSign,
  Navigation,
  Check,
  X,
  Star,
  TrendingUp,
  Package,
  Pencil,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DriverProfile = {
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  vehicle_type: string | null
  avg_rating: number | null
  total_deliveries: number | null
  acceptance_rate: number | null
}

type NavProvider = 'google' | 'apple' | 'waze'

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable pieces
// ─────────────────────────────────────────────────────────────────────────────

function SettingRow({
  icon: Icon,
  label,
  sublabel,
  right,
  onClick,
  destructive = false,
  className = '',
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  right?: React.ReactNode
  onClick?: () => void
  destructive?: boolean
  className?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' } : {})}
      className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors ${className}`}
    >
      <div className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={destructive ? 'text-red-400' : 'text-zinc-400'} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold ${destructive ? 'text-red-400' : 'text-white'}`}>{label}</p>
        {sublabel && <p className="text-xs text-zinc-500 mt-0.5 truncate">{sublabel}</p>}
      </div>
      {right !== undefined ? right : onClick ? <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" /> : null}
    </Tag>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-[#FF7A50]' : 'bg-[#2A2A2A]'}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-1 mb-2 group"
    >
      <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest group-active:text-zinc-400 transition-colors">
        {label}
      </p>
      <ChevronDown
        size={14}
        className={`text-zinc-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const activeOrderId = useActiveOrderId()
  const clearStore = useDriverStore((s) => s.clearStore)
  const userId = useDriverStore((s) => s.userId)
  const userEmail = useDriverStore((s) => s.userEmail)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Performance stats ──────────────────────────────────────────────────────
  const [completionRate, setCompletionRate] = useState<number | null>(null)

  // ── App settings (localStorage) ───────────────────────────────────────────
  const [navProvider, setNavProvider] = useState<NavProvider>('google')
  const [pushNotifs, setPushNotifs] = useState(true)
  const [requestSounds, setRequestSounds] = useState(true)
  const [earningsAlerts, setEarningsAlerts] = useState(true)

  // ── Collapsible section open state ────────────────────────────────────────
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Auth guard + data load
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    // Load localStorage preferences
    const stored = {
      nav: localStorage.getItem('driver_nav_provider') as NavProvider | null,
      push: localStorage.getItem('driver_push_notifs'),
      sounds: localStorage.getItem('driver_request_sounds'),
      earnings: localStorage.getItem('driver_earnings_alerts'),
    }
    if (stored.nav) setNavProvider(stored.nav)
    if (stored.push !== null) setPushNotifs(stored.push === 'true')
    if (stored.sounds !== null) setRequestSounds(stored.sounds === 'true')
    if (stored.earnings !== null) setEarningsAlerts(stored.earnings === 'true')

    async function load() {
      const supabase = createClient()

      const [profileRes, ordersRes] = await Promise.all([
        supabase
          .from('driver_profiles')
          .select('full_name, phone, avatar_url, vehicle_type, avg_rating, total_deliveries, acceptance_rate')
          .eq('id', userId)
          .single(),
        supabase
          .from('orders')
          .select('status')
          .eq('nexter_id', userId)
          .in('status', ['delivered', 'failed_delivery']),
      ])

      if (profileRes.data) {
        const p = profileRes.data as DriverProfile
        setProfile(p)
        setEditName(p.full_name ?? '')
        setEditPhone(p.phone ?? '')

        // Avatar: storage path → signed URL
        const storagePath = p.avatar_url
        if (storagePath && !storagePath.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(storagePath, 3600)
          setAvatarDisplayUrl(signed?.signedUrl ?? null)
        } else {
          setAvatarDisplayUrl(storagePath ?? null)
        }
      }

      if (ordersRes.data && ordersRes.data.length > 0) {
        const total = ordersRes.data.length
        const delivered = ordersRes.data.filter((o) => o.status === 'delivered').length
        setCompletionRate(Math.round((delivered / total) * 100))
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
      // Reset input so same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = ''
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
      if (error) {
        setSaveError(error.message)
        return
      }
      // Optimistic update
      setProfile((prev) =>
        prev ? { ...prev, full_name: editName.trim(), phone: editPhone.trim() } : prev
      )
      setEditing(false)
    } catch (err) {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setSaveError(null)
    setEditName(profile?.full_name ?? '')
    setEditPhone(profile?.phone ?? '')
  }

  const setNavProviderPersist = useCallback((p: NavProvider) => {
    setNavProvider(p)
    localStorage.setItem('driver_nav_provider', p)
  }, [])

  const setPushNotifsPersist = useCallback((v: boolean) => {
    setPushNotifs(v)
    localStorage.setItem('driver_push_notifs', String(v))
  }, [])

  const setRequestSoundsPersist = useCallback((v: boolean) => {
    setRequestSounds(v)
    localStorage.setItem('driver_request_sounds', String(v))
  }, [])

  const setEarningsAlertsPersist = useCallback((v: boolean) => {
    setEarningsAlerts(v)
    localStorage.setItem('driver_earnings_alerts', String(v))
  }, [])

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

  // ─────────────────────────────────────────────────────────────────────────
  // Loading skeleton
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <AppHeader title="Settings" />
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

  const initials = (profile?.full_name ?? userEmail ?? 'D')[0].toUpperCase()

  const acceptanceRateStat = (() => {
    const rate = profile?.acceptance_rate
    if (rate == null) return '—'
    // acceptance_rate is stored as 0–100 in driver_profiles (not a 0–1 ratio)
    return `${Math.round(rate)}%`
  })()

  const completionRateStat = completionRate != null ? `${completionRate}%` : '—'
  const ratingStat = profile?.avg_rating != null ? profile.avg_rating.toFixed(1) : '—'

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
      <AppHeader title="Settings" />

      {/* Hidden avatar file input */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      <div className="px-4 pt-5 pb-10 space-y-5">

        {/* ── Profile Card ──────────────────────────────────────────────── */}
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          {/* Avatar + identity */}
          <div className="flex items-center gap-4 px-4 pt-4 pb-3">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative w-18 h-18 rounded-2xl overflow-hidden bg-[#242424] border border-white/8 flex items-center justify-center shadow-md active:scale-95 transition-transform"
                style={{ width: 72, height: 72 }}
                aria-label="Change avatar"
              >
                {avatarDisplayUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarDisplayUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-2xl font-black">{initials}</span>
                )}
                {uploadingAvatar ? (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Camera size={18} className="text-white" />
                  </div>
                )}
              </button>
              {/* Camera badge */}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#FF7A50] rounded-full flex items-center justify-center shadow pointer-events-none">
                <Camera size={10} className="text-white" />
              </div>
            </div>

            {/* Name / email */}
            {!editing ? (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-black text-white truncate">{profile?.full_name ?? 'Driver'}</p>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#242424] border border-white/8 flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Edit profile"
                  >
                    <Pencil size={11} className="text-zinc-400" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{userEmail}</p>
                {profile?.phone && (
                  <p className="text-xs text-zinc-600 mt-0.5">{profile.phone}</p>
                )}
              </div>
            ) : (
              /* Edit mode */
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
                {saveError && (
                  <p className="text-xs text-red-400">{saveError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-[#FF7A50] rounded-xl text-xs font-bold text-white disabled:opacity-60 active:scale-95 transition-all"
                  >
                    {savingProfile ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-[#242424] border border-white/8 rounded-xl text-xs font-bold text-zinc-300 disabled:opacity-60 active:scale-95 transition-all"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5" />

          {/* Performance stats */}
          <div className="grid grid-cols-3 divide-x divide-white/5 px-0 py-3">
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp size={13} className="text-zinc-600" />
              </div>
              <p className="font-black text-white text-lg leading-none">{acceptanceRateStat}</p>
              <p className="text-[10px] text-zinc-600 mt-1 leading-tight">Acceptance</p>
            </div>
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1">
                <Package size={13} className="text-zinc-600" />
              </div>
              <p className="font-black text-white text-lg leading-none">{completionRateStat}</p>
              <p className="text-[10px] text-zinc-600 mt-1 leading-tight">Completion</p>
            </div>
            <div className="text-center px-2">
              <div className="flex items-center justify-center mb-1">
                <Star size={13} className="text-zinc-600" />
              </div>
              <p className="font-black text-white text-lg leading-none">{ratingStat}</p>
              <p className="text-[10px] text-zinc-600 mt-1 leading-tight">Rating</p>
            </div>
          </div>
        </div>

        {/* ── App Settings (collapsible) ─────────────────────────────────── */}
        <div>
          <SectionHeader
            label="App Settings"
            open={appSettingsOpen}
            onToggle={() => setAppSettingsOpen((o) => !o)}
          />
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${appSettingsOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">

              {/* Navigation provider */}
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
                  {((['google', 'apple', 'waze'] as NavProvider[])).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNavProviderPersist(p)}
                      className={`flex-1 h-8 rounded-xl text-xs font-bold transition-colors border ${navProvider === p
                          ? 'bg-[#FF7A50] border-[#FF7A50] text-white'
                          : 'bg-[#1E1E1E] border-white/8 text-zinc-400 active:bg-[#2A2A2A]'
                        }`}
                    >
                      {navLabels[p].split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Push Notifications */}
              <SettingRow
                icon={Bell}
                label="Push Notifications"
                sublabel="Order alerts and updates"
                right={<Toggle value={pushNotifs} onChange={setPushNotifsPersist} />}
              />

              {/* Request Sounds */}
              <SettingRow
                icon={Volume2}
                label="Delivery Request Sounds"
                sublabel="Audio alert for new orders"
                right={<Toggle value={requestSounds} onChange={setRequestSoundsPersist} />}
              />

              {/* Earnings Alerts */}
              <SettingRow
                icon={DollarSign}
                label="Earnings Summary Alerts"
                sublabel="Daily earnings notifications"
                right={<Toggle value={earningsAlerts} onChange={setEarningsAlertsPersist} />}
              />
            </div>
          </div>
        </div>

        {/* ── Support (collapsible) ──────────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Support"
            open={supportOpen}
            onToggle={() => setSupportOpen((o) => !o)}
          />
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${supportOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">

              <a href="mailto:support@doornext.com" className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
                  <Mail size={16} className="text-zinc-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white">Email Support</p>
                  <p className="text-xs text-zinc-500">support@doornext.com</p>
                </div>
                <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" />
              </a>

              <a
                href="https://wa.me/15551234567"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={16} className="text-zinc-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white">WhatsApp</p>
                  <p className="text-xs text-zinc-500">Chat with support</p>
                </div>
                <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" />
              </a>

              <a href="tel:+15551234567" className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-[#1E1E1E] flex items-center justify-center flex-shrink-0">
                  <Phone size={16} className="text-zinc-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white">Call Support</p>
                  <p className="text-xs text-zinc-500">+1 (555) 123-4567</p>
                </div>
                <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" />
              </a>

            </div>
          </div>
        </div>

        {/* ── Security ──────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest mb-2 px-1">Security</p>
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

        {/* ── Version footer ────────────────────────────────────────────── */}
        <div className="pt-2 text-center">
          <p className="text-[11px] text-zinc-800">Doornext Driver v1.0.0</p>
        </div>

      </div>
    </div>
  )
}
