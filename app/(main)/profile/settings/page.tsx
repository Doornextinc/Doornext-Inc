'use client'

import { useState } from 'react'
import { BackBar } from '@/components/layout/top-bar'

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
  const [pushOrders, setPushOrders] = useState(true)
  const [pushMessages, setPushMessages] = useState(true)
  const [pushPromos, setPushPromos] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

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
            value={pushOrders}
            onChange={setPushOrders}
          />
          <SettingToggle
            label="New Messages"
            description="Get notified when a maker messages you"
            value={pushMessages}
            onChange={setPushMessages}
          />
          <SettingToggle
            label="Promotions"
            description="Deals, discounts, and new makers near you"
            value={pushPromos}
            onChange={setPushPromos}
          />
        </div>

        <div className="bg-white rounded-2xl px-4 divide-y divide-gray-50">
          <div className="py-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Sound & Haptics</p>
          </div>
          <SettingToggle
            label="Sound Effects"
            description="Play sounds for order updates and messages"
            value={soundEnabled}
            onChange={setSoundEnabled}
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
