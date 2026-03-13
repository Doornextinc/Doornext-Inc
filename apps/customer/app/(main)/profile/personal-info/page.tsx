'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export default function PersonalInfoPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('users')
        .select('full_name, email, avatar_url')
        .eq('id', user.id)
        .single()

      setFullName(data?.full_name || '')
      setEmail(data?.email || user.email || '')
      setAvatarUrl(data?.avatar_url || null)
      setLoading(false)
    }
    load()
  }, [router])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const uploadAvatar = async (file: File): Promise<string | null> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload-avatar', { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('Avatar upload error:', body)
      return null
    }
    const { url } = await res.json()
    return url
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setUploadError(null)
    try {
      let newAvatarUrl = avatarUrl

      if (pendingFile) {
        setUploadingAvatar(true)
        const url = await uploadAvatar(pendingFile)
        setUploadingAvatar(false)
        if (url) {
          newAvatarUrl = url
          setAvatarUrl(url)
          setPendingFile(null)
          setPreviewUrl(null)
        } else {
          setUploadError('Photo upload failed. Check your connection and try again.')
          setSaving(false)
          return
        }
      }

      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ full_name: fullName, avatar_url: newAvatarUrl })
        .eq('id', userId)

      if (error) {
        setUploadError('Failed to save changes. Please try again.')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  const displayAvatar = previewUrl || avatarUrl
  const initials = (fullName?.[0] ?? 'U').toUpperCase()

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Personal Info" />
        <div className="p-4 space-y-4 animate-pulse">
          <div className="flex justify-center py-6">
            <div className="w-24 h-24 rounded-3xl bg-gray-200" />
          </div>
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
        {/* Avatar */}
        <div className="flex flex-col items-center py-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative group"
            disabled={saving}
          >
            <div className="w-24 h-24 rounded-3xl overflow-hidden bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayAvatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-3xl font-black">{initials}</span>
              )}
            </div>
            {/* Overlay on hover */}
            <div className="absolute inset-0 rounded-3xl bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {uploadingAvatar ? (
                <Loader2 size={20} className="text-white animate-spin" />
              ) : (
                <Camera size={20} className="text-white" />
              )}
            </div>
            {/* Camera badge */}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#FF6B35] rounded-full border-2 border-white flex items-center justify-center">
              <Camera size={12} className="text-white" />
            </div>
          </button>
          <p className="text-xs text-gray-400 mt-3">Tap to change photo</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Full Name */}
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

        {/* Email (read-only) */}
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

        {uploadError && (
          <p className="text-sm text-red-500 text-center">{uploadError}</p>
        )}

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
