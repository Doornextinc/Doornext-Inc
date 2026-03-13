'use client'

import { useState, useEffect } from 'react'
import { BackBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'doornext-settings'

interface Settings {
  pushOrders: boolean
  pushMessages: boolean
  pushPromos: boolean
  soundEnabled: boolean
}

const DEFAULTS: Settings = {
  pushOrders: true,
  pushMessages: true,
  pushPromos: false,
  soundEnabled: true,
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function saveLocal(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

async function saveRemote(s: Settings) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('users').update({ notification_prefs: s }).eq('id', user.id)
  } catch { /* no-op */ }
}

interface ToggleProps {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}

function SettingToggle({ label, description, value, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-[#FF6B35]' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Show localStorage values immediately (instant paint)
    const local = loadSettings()
    setSettings(local)
    setMounted(true)

    // Then fetch from Supabase and override if available
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('notification_prefs').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.notification_prefs) {
            const merged = { ...DEFAULTS, ...(data.notification_prefs as Partial<Settings>) }
            setSettings(merged)
            saveLocal(merged)
          }
        })
    })
  }, [])

  const update = (key: keyof Settings) => (value: boolean) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveLocal(next)
    saveRemote(next)
  }

  if (!mounted) return null

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="App Settings" />

      <div className="p-4 space-y-3">
        <div className="bg-white rounded-2xl px-4 divide-y divide-gray-50">
          <div className="py-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Push Notifications</p>
          </div>
          <SettingToggle
            label="Order Updates"
            description="Get notified when your order status changes"
            value={settings.pushOrders}
            onChange={update('pushOrders')}
          />
          <SettingToggle
            label="New Messages"
            description="Get notified when a maker messages you"
            value={settings.pushMessages}
            onChange={update('pushMessages')}
          />
          <SettingToggle
            label="Promotions"
            description="Deals, discounts, and new makers near you"
            value={settings.pushPromos}
            onChange={update('pushPromos')}
          />
        </div>

        <div className="bg-white rounded-2xl px-4 divide-y divide-gray-50">
          <div className="py-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Sound & Haptics</p>
          </div>
          <SettingToggle
            label="Sound Effects"
            description="Play sounds for order updates and messages"
            value={settings.soundEnabled}
            onChange={update('soundEnabled')}
          />
        </div>

        <div className="bg-white rounded-2xl px-4 py-4 text-center">
          <p className="text-xs text-gray-300">Doornext v1.0.0</p>
          <p className="text-xs text-gray-300 mt-0.5">© 2026 Doornext Inc.</p>
        </div>
      </div>
    </div>
  )
}
