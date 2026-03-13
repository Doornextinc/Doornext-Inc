'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export default function PersonalInfoPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('users').select('full_name, email').eq('id', user.id).single()
      setFullName(data?.full_name || '')
      setEmail(data?.email || user.email || '')
      setLoading(false)
    }
    load()
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('users').update({ full_name: fullName }).eq('id', user.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Personal Info" />
        <div className="p-4 space-y-4 animate-pulse">
          <div className="h-14 bg-white rounded-2xl" />
          <div className="h-14 bg-white rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Personal Info" />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl px-4 py-3">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-1">
            Full Name
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            className="w-full text-gray-900 font-semibold text-base outline-none"
          />
        </div>

        <div className="bg-white rounded-2xl px-4 py-3">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-1">
            Email
          </label>
          <input
            value={email}
            readOnly
            className="w-full text-gray-400 font-semibold text-base outline-none cursor-not-allowed"
          />
          <p className="text-xs text-gray-300 mt-1">Email cannot be changed here</p>
        </div>

        <Button
          onClick={handleSave}
          loading={saving}
          disabled={saving || !fullName.trim()}
          className="w-full"
        >
          {saved ? '✓ Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
