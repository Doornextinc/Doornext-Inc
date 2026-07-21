'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import {
  ListGroup, ListRow, InfoField, PrimaryButton, GroupTitle,
} from '@/components/ui/list'
import { Camera, Check, X, ShieldCheck } from 'lucide-react'

/**
 * Profile — read-only personal information plus performance, matching the
 * Dasher account model. Everything that used to live here has a new home:
 *
 *   • online toggle      → home screen (already owns `toggleOnline`)
 *   • support / sign out → /account
 *   • app preferences    → /settings (which already owned the same
 *                          localStorage keys; this page duplicated them)
 */

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

const KYC_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  not_submitted:  { label: 'Not submitted', color: 'text-zinc-400',  dot: 'bg-zinc-500'  },
  pending_review: { label: 'Under review',  color: 'text-amber-400', dot: 'bg-amber-400' },
  approved:       { label: 'Verified',      color: 'text-green-400', dot: 'bg-green-400' },
  rejected:       { label: 'Action needed', color: 'text-red-400',   dot: 'bg-red-400'   },
}

function PerfTile({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const toneCls =
    tone === 'good' ? 'text-green-400'
    : tone === 'warn' ? 'text-amber-400'
    : tone === 'bad' ? 'text-red-400'
    : 'text-zinc-400'
  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3.5">
      <p className={`text-[22px] font-black leading-none ${toneCls}`}>{value}</p>
      <p className="text-[12px] text-zinc-500 mt-1.5">{label}</p>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const userEmail = useDriverStore((s) => s.userEmail)
  const authReady = useDriverStore((s) => s.authReady)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)

  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [completionRate, setCompletionRate] = useState<number | null>(null)
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null)

  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

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
        const total = ordersRes.data.length
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

  const kyc = KYC_LABEL[profile?.kyc_status ?? 'not_submitted'] ?? KYC_LABEL.not_submitted
  const initial = (profile?.full_name ?? 'D')[0].toUpperCase()
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808]">
        <AppHeader title="Profile" showBack backHref="/account" />
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080808] pb-10">
      <AppHeader title="Profile" showBack backHref="/account" />

      {/* ── Avatar + identity ──────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-7 pb-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4622B] to-[#E07545] flex items-center justify-center overflow-hidden">
            {avatarDisplayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarDisplayUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-black text-2xl">{initial}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#1E1E1E] border border-white/10 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
          >
            {uploadingAvatar
              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Camera size={14} className="text-zinc-300" />}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        <p className="text-[20px] font-black text-white mt-3">{profile?.full_name ?? 'Nexter'}</p>
        <div className={`flex items-center gap-1.5 text-[13px] font-semibold mt-1 ${kyc.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${kyc.dot}`} />
          {kyc.label}
        </div>
      </div>

      {/* ── Personal information ───────────────────────────────────────────── */}
      <GroupTitle>Personal information</GroupTitle>
      <div className="border-t border-white/8">
        {editing ? (
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-[13px] text-zinc-500" htmlFor="edit-name">Full name</label>
              <input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full mt-1 bg-[#141414] border border-white/10 rounded-xl px-3 py-2.5 text-[17px] text-white focus:outline-none focus:border-[#FF7A50]"
              />
            </div>
            <div>
              <label className="text-[13px] text-zinc-500" htmlFor="edit-phone">Phone number</label>
              <input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                inputMode="tel"
                className="w-full mt-1 bg-[#141414] border border-white/10 rounded-xl px-3 py-2.5 text-[17px] text-white focus:outline-none focus:border-[#FF7A50]"
              />
            </div>
            {saveError && <p className="text-[13px] text-red-400">{saveError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 bg-[#FF7A50] rounded-full text-[15px] font-bold text-white disabled:opacity-60 active:scale-95 transition-all"
              >
                {savingProfile
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check size={16} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setSaveError(null)
                  setEditName(profile?.full_name ?? '')
                  setEditPhone(profile?.phone ?? '')
                }}
                disabled={savingProfile}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 bg-[#242424] border border-white/8 rounded-full text-[15px] font-bold text-zinc-300 disabled:opacity-60 active:scale-95 transition-all"
              >
                <X size={16} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <InfoField label="Full name" value={profile?.full_name} />
            <InfoField label="Email" value={userEmail} />
            <InfoField label="Phone number" value={profile?.phone} />
            <InfoField label="Vehicle" value={profile?.vehicle_type} />
            <InfoField label="Driver ID" value={profile?.id} />
            <InfoField label="Member since" value={memberSince} />
            <div className="px-5 pt-4 pb-2">
              <PrimaryButton onClick={() => setEditing(true)}>Edit profile</PrimaryButton>
            </div>
          </>
        )}
      </div>

      {/* ── Verification ───────────────────────────────────────────────────── */}
      <ListGroup title="Verification">
        <ListRow
          icon={ShieldCheck}
          label="Identity verification"
          sublabel={
            profile?.kyc_status === 'approved'
              ? 'Verified — eligible for payouts'
              : 'Required to receive payouts'
          }
          href="/documents"
          right={
            <span className={`flex items-center gap-1.5 text-[13px] font-bold ${kyc.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${kyc.dot}`} />
              {kyc.label}
            </span>
          }
        />
      </ListGroup>

      {/* ── Performance ────────────────────────────────────────────────────── */}
      <GroupTitle>Performance</GroupTitle>
      <div className="px-5 grid grid-cols-2 gap-2.5">
        <PerfTile
          label="Deliveries"
          value={String(profile?.total_deliveries ?? 0)}
          tone="neutral"
        />
        <PerfTile
          label="Rating"
          value={profile?.avg_rating != null ? profile.avg_rating.toFixed(1) : '—'}
          tone={
            profile?.avg_rating == null ? 'neutral'
            : profile.avg_rating >= 4.5 ? 'good'
            : profile.avg_rating >= 4.0 ? 'warn'
            : 'bad'
          }
        />
        <PerfTile
          label="Acceptance"
          value={profile?.acceptance_rate != null ? `${Math.round(profile.acceptance_rate)}%` : '—'}
          tone={
            profile?.acceptance_rate == null ? 'neutral'
            : profile.acceptance_rate >= 80 ? 'good'
            : profile.acceptance_rate >= 60 ? 'warn'
            : 'bad'
          }
        />
        <PerfTile
          label="On-time"
          value={profile?.on_time_delivery_rate != null ? `${Math.round(profile.on_time_delivery_rate)}%` : '—'}
          tone={
            profile?.on_time_delivery_rate == null ? 'neutral'
            : profile.on_time_delivery_rate >= 85 ? 'good'
            : profile.on_time_delivery_rate >= 65 ? 'warn'
            : 'bad'
          }
        />
        <PerfTile
          label="Completion"
          value={completionRate != null ? `${completionRate}%` : '—'}
          tone={
            completionRate == null ? 'neutral'
            : completionRate >= 90 ? 'good'
            : completionRate >= 70 ? 'warn'
            : 'bad'
          }
        />
        <PerfTile
          label="Total earned"
          value={totalEarnings != null ? `$${totalEarnings.toFixed(0)}` : '—'}
          tone="neutral"
        />
      </div>
    </div>
  )
}
