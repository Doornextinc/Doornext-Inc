'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore, useActiveOrderId } from '@/store/driver-store'
import { ScreenTitle, ListGroup, ListRow } from '@/components/ui/list'
import { BRAND } from '@doornext/shared/brand'
import {
  User, FileText, Settings, DollarSign, Clock, Bell, Car,
  Mail, MessageCircle, Phone, Lock, LogOut,
} from 'lucide-react'

/**
 * Account hub — the routing surface for everything that isn't a delivery.
 *
 * Rows here only ever point at screens that exist. Deliberately absent are
 * DoorDash concepts we have no feature for (referrals, Red Card, saved login);
 * adding them would mean dead links.
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

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    const supabase = createClient()
    supabase
      .from('driver_profiles')
      .select('full_name, kyc_status')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setFullName(data.full_name)
        setKycStatus(data.kyc_status)
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

  return (
    <div className="min-h-screen bg-[#080808] pb-10">
      <ScreenTitle>Account</ScreenTitle>

      <ListGroup>
        <ListRow icon={User} label="Profile" sublabel={fullName ?? undefined} href="/profile" />
        <ListRow icon={FileText} label="Account data" sublabel={kycLabel} href="/documents" />
        {/* Vehicle details are edited on the documents screen (update-vehicle). */}
        <ListRow icon={Car} label="Vehicle management" href="/documents" />
        <ListRow icon={Settings} label="App settings" href="/settings" />
      </ListGroup>

      <ListGroup title="Activity">
        <ListRow icon={DollarSign} label="Earnings" href="/earnings" />
        <ListRow icon={Clock} label="Delivery history" href="/history" />
        <ListRow icon={Bell} label="Notifications" href="/notifications" />
      </ListGroup>

      <ListGroup title="Support">
        <ListRow
          icon={Mail}
          label="Email support"
          sublabel={BRAND.support.email}
          href={`mailto:${BRAND.support.email}`}
        />
        <ListRow
          icon={MessageCircle}
          label="WhatsApp"
          sublabel="Chat with support"
          href={BRAND.support.whatsapp}
        />
        <ListRow
          icon={Phone}
          label="Call support"
          sublabel={BRAND.support.phone}
          href={`tel:${BRAND.support.phone.replace(/[^+\d]/g, '')}`}
        />
      </ListGroup>

      <ListGroup title="Security">
        <ListRow icon={Lock} label="Change password" href="/forgot-password" />
        <ListRow icon={LogOut} label="Log out" destructive hideChevron onClick={handleSignOut} />
      </ListGroup>

      <p className="text-[11px] text-zinc-700 text-center pt-8">Nexter v1.0.0</p>
    </div>
  )
}
