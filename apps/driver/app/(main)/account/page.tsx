'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore, useActiveOrderId } from '@/store/driver-store'
import { Screen, SectionTitle, ListCard, ListRow, PillButton, Chip } from '@/components/ui/kit'
import { BRAND } from '@doornext/shared/brand'
import {
  User, FileText, Car, Settings, DollarSign, Clock, Bell,
  Mail, MessageCircle, Phone, Lock, LogOut, Star,
} from 'lucide-react'

/**
 * Account hub — Neighborly Modern (light).
 *
 * Same destinations and sign-out flow as before; only the presentation
 * changed. Rows point only at screens that exist. Deliberately absent are
 * DoorDash concepts we have no feature for (referrals, Red Card, saved login).
 */
export default function AccountPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const authReady = useDriverStore((s) => s.authReady)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const clearStore = useDriverStore((s) => s.clearStore)
  const activeOrderId = useActiveOrderId()

  const [fullName, setFullName] = useState<string | null>(null)
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    const supabase = createClient()
    supabase
      .from('driver_profiles')
      .select('full_name, kyc_status, avg_rating, avatar_url')
      .eq('id', userId)
      .single()
      .then(async ({ data }) => {
        if (!data) return
        setFullName(data.full_name)
        setKycStatus(data.kyc_status)
        setRating(data.avg_rating)
        const path = data.avatar_url
        if (path && !path.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(path, 3600)
          setAvatarUrl(signed?.signedUrl ?? null)
        } else {
          setAvatarUrl(path)
        }
      })
  }, [router, userId, authReady, hasHydrated])

  const handleSignOut = async () => {
    if (activeOrderId) {
      const ok = window.confirm(
        "You have an active delivery. Signing out won't cancel it, but you'll need to log back in to complete it. Sign out anyway?",
      )
      if (!ok) return
    }
    const supabase = createClient()
    if (userId) await supabase.from('driver_profiles').update({ is_active: false }).eq('id', userId)
    clearStore()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const kycLabel =
    kycStatus === 'approved' ? 'Verified'
    : kycStatus === 'pending_review' ? 'Under review'
    : kycStatus === 'rejected' ? 'Action needed'
    : 'Not submitted'
  const kycTone = kycStatus === 'approved' ? 'green' : kycStatus === 'rejected' ? 'error' : 'neutral'
  const initial = (fullName ?? 'N')[0].toUpperCase()

  return (
    <Screen>
      {/* Top app bar */}
      <header className="sticky top-0 z-40 bg-surface flex items-center justify-between px-5 h-16">
        <span className="font-display text-3xl font-extrabold text-primary tracking-tight">Nexter</span>
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="w-10 h-10 flex items-center justify-center rounded-full text-primary active:bg-surface-variant transition-colors"
        >
          <Bell size={22} />
        </Link>
      </header>

      <main className="px-5 space-y-6 pt-2">
        {/* Profile hero */}
        <section className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/30">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary-container flex items-center justify-center bg-primary-fixed flex-shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-2xl font-extrabold text-on-primary-fixed">{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-on-surface leading-tight truncate">
                {fullName ?? 'Nexter'}
              </h1>
              {rating != null && (
                <div className="flex items-center gap-1 text-primary mt-0.5">
                  <Star size={16} fill="currentColor" />
                  <span className="font-mono text-[13px] tracking-wide">{rating.toFixed(1)} RATING</span>
                </div>
              )}
              <div className="mt-2">
                <Chip tone={kycTone}>{kycLabel.toUpperCase()}</Chip>
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <SectionTitle>Account</SectionTitle>
          <ListCard>
            <ListRow icon={User} label="Profile" sublabel={fullName ?? undefined} href="/profile" />
            <ListRow icon={FileText} label="Account data" sublabel={kycLabel} href="/documents" />
            <ListRow icon={Car} label="Vehicle management" href="/documents" />
            <ListRow icon={Settings} label="App settings" href="/settings" />
          </ListCard>
        </section>

        {/* Activity */}
        <section>
          <SectionTitle>Activity</SectionTitle>
          <ListCard>
            <ListRow icon={DollarSign} label="Earnings" href="/earnings" />
            <ListRow icon={Clock} label="Delivery history" href="/history" />
            <ListRow icon={Bell} label="Notifications" href="/notifications" />
          </ListCard>
        </section>

        {/* Support */}
        <section>
          <SectionTitle>Support</SectionTitle>
          <ListCard>
            <ListRow icon={Mail} label="Email support" sublabel={BRAND.support.email} href={`mailto:${BRAND.support.email}`} />
            <ListRow icon={MessageCircle} label="WhatsApp" sublabel="Chat with support" href={BRAND.support.whatsapp} />
            <ListRow icon={Phone} label="Call support" sublabel={BRAND.support.phone} href={`tel:${BRAND.support.phone.replace(/[^+\d]/g, '')}`} />
          </ListCard>
        </section>

        {/* Security */}
        <section>
          <SectionTitle>Security</SectionTitle>
          <ListCard>
            <ListRow icon={Lock} label="Change password" href="/forgot-password" />
          </ListCard>
        </section>

        <PillButton variant="danger" icon={LogOut} onClick={handleSignOut}>Log out</PillButton>

        <p className="font-mono text-[11px] text-outline text-center pt-2">Nexter v1.0.0</p>
      </main>
    </Screen>
  )
}
