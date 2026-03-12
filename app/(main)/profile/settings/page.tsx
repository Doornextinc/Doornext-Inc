'use client'

import { BackBar } from '@/components/layout/top-bar'

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Settings" />
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-5xl mb-4">⚙️</span>
        <p className="text-gray-400">Settings coming soon</p>
      </div>
    </div>
  )
}
