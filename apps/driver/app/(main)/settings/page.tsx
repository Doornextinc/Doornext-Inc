'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { ListGroup, ListRow, RadioRow, Toggle } from '@/components/ui/list'

/**
 * App Settings — device and notification preferences only.
 *
 * Profile fields and performance moved to /profile; support, password and
 * sign-out moved to /account. This page previously duplicated all three.
 * Preference keys are unchanged, so existing drivers keep their settings.
 */

type NavProvider = 'google' | 'apple' | 'waze'

const NAV_OPTIONS: Array<{ value: NavProvider; label: string; sublabel?: string }> = [
  { value: 'google', label: 'Google Maps', sublabel: 'Default' },
  { value: 'apple',  label: 'Apple Maps' },
  { value: 'waze',   label: 'Waze' },
]

export default function SettingsPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const authReady = useDriverStore((s) => s.authReady)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)

  const [navProvider, setNavProvider] = useState<NavProvider>('google')
  const [pushNotifs, setPushNotifs] = useState(true)
  const [requestSounds, setRequestSounds] = useState(true)
  const [earningsAlerts, setEarningsAlerts] = useState(true)

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    const nav = localStorage.getItem('driver_nav_provider') as NavProvider | null
    const push = localStorage.getItem('driver_push_notifs')
    const sounds = localStorage.getItem('driver_request_sounds')
    const earnings = localStorage.getItem('driver_earnings_alerts')

    if (nav) setNavProvider(nav)
    if (push !== null) setPushNotifs(push === 'true')
    if (sounds !== null) setRequestSounds(sounds === 'true')
    if (earnings !== null) setEarningsAlerts(earnings === 'true')
  }, [router, userId, authReady, hasHydrated])

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

  return (
    <div className="min-h-screen bg-[#080808] pb-10">
      <AppHeader title="App Settings" showBack backHref="/account" />

      <ListGroup title="Mapping service">
        {NAV_OPTIONS.map((opt) => (
          <RadioRow
            key={opt.value}
            label={opt.label}
            sublabel={opt.sublabel}
            selected={navProvider === opt.value}
            onSelect={() => setNavPersist(opt.value)}
          />
        ))}
      </ListGroup>

      <ListGroup title="Notifications">
        <ListRow
          label="Push notifications"
          sublabel="Order alerts and updates"
          right={<Toggle value={pushNotifs} onChange={setPushPersist} label="Push notifications" />}
        />
        <ListRow
          label="Delivery request sounds"
          sublabel="Audio alert for new orders"
          right={<Toggle value={requestSounds} onChange={setSoundsPersist} label="Delivery request sounds" />}
        />
        <ListRow
          label="Earnings summary alerts"
          sublabel="Daily earnings notifications"
          right={<Toggle value={earningsAlerts} onChange={setEarningsPersist} label="Earnings summary alerts" />}
        />
      </ListGroup>

      <ListGroup title="Application information">
        <ListRow label="Version" right={<span className="text-[15px] text-zinc-500">1.0.0</span>} />
      </ListGroup>
    </div>
  )
}
