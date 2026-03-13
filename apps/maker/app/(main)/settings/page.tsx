'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2, Lock, User, Bell, Shield, Trash2, Camera } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profile, setProfile] = useState({ display_name: '', bio: '' })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [password, setPassword] = useState({ new: '', confirm: '' })
  const [notifications, setNotifications] = useState({
    newOrders: true,
    soundEnabled: true,
  })
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? '')

      const { data: maker } = await supabase
        .from('food_makers')
        .select('display_name, bio, avatar_url')
        .eq('user_id', user.id)
        .single()

      if (maker) {
        setProfile({ display_name: maker.display_name ?? '', bio: maker.bio ?? '' })
        setAvatarUrl(maker.avatar_url ?? null)
        setAvatarPreview(maker.avatar_url ?? null)
      }
      setLoading(false)
    }
    load()
  }, [router])

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAvatarPreview(URL.createObjectURL(file))
    setUploadingAvatar(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/kitchen-avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Persist immediately
      await supabase
        .from('food_makers')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id)

      setAvatarUrl(publicUrl)
      flash('ok', 'Profile photo updated')
    } catch {
      flash('err', 'Photo upload failed. Please try again.')
      setAvatarPreview(avatarUrl)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!profile.display_name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('food_makers')
        .update({ display_name: profile.display_name.trim(), bio: profile.bio.trim() || null })
        .eq('user_id', user.id)
      if (error) flash('err', 'Failed to save profile')
      else flash('ok', 'Profile updated')
    }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    if (password.new !== password.confirm) { flash('err', "Passwords don't match"); return }
    if (password.new.length < 6) { flash('err', 'Password must be at least 6 characters'); return }
    setChangingPassword(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: password.new })
    if (error) flash('err', error.message)
    else { flash('ok', 'Password changed'); setPassword({ new: '', confirm: '' }) }
    setChangingPassword(false)
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <div className="bg-white px-4 h-[60px] flex items-center border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded w-20 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
  const initials = (profile.display_name?.[0] ?? 'M').toUpperCase()

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center gap-3">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <h1 className="text-[18px] font-black text-gray-900">Settings</h1>
      </header>

      {msg && (
        <div className={`mx-4 mt-4 px-4 py-3 rounded-2xl text-sm font-semibold ${
          msg.type === 'ok'
            ? 'bg-orange-50 text-[#FF6B35] border border-orange-100'
            : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* Kitchen Profile */}
        <section>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <User size={11} /> Kitchen Profile
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">

            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] overflow-hidden shadow-md shadow-[#FF6B35]/25 flex items-center justify-center">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-2xl font-black">{initials}</span>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                      <Loader2 size={20} className="text-white animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[#FF6B35] rounded-full flex items-center justify-center shadow-md disabled:opacity-50"
                >
                  <Camera size={13} className="text-white" />
                </button>
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{profile.display_name || 'Your Kitchen'}</p>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-xs text-[#FF6B35] font-semibold mt-0.5 disabled:opacity-50"
                >
                  {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                </button>
                <p className="text-[11px] text-gray-400 mt-0.5">JPEG, PNG, WebP · Max 5 MB</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Kitchen Name</label>
              <input
                type="text"
                value={profile.display_name}
                onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))}
                className={inputClass}
                placeholder="Jane's Kitchen"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Bio</label>
              <textarea
                value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Tell customers about your kitchen…"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                disabled
                value={email}
                className="w-full bg-gray-100 border border-gray-100 rounded-xl px-3.5 py-3 text-sm text-gray-400"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-[#FF6B35]/30"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Bell size={11} /> Notifications
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {[
              { key: 'newOrders' as const, label: 'New order alerts', desc: 'Notify when a new order arrives' },
              { key: 'soundEnabled' as const, label: 'Sound alerts', desc: 'Play a sound for new orders' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setNotifications(n => ({ ...n, [key]: !n[key] }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifications[key] ? 'bg-[#FF6B35]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${notifications[key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Lock size={11} /> Security
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">New Password</label>
              <input
                type="password"
                value={password.new}
                onChange={e => setPassword(p => ({ ...p, new: e.target.value }))}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
              <input
                type="password"
                value={password.confirm}
                onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !password.new}
              className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-[#FF6B35]/30"
            >
              {changingPassword && <Loader2 size={14} className="animate-spin" />}
              Change Password
            </button>
          </div>
        </section>

        {/* Account */}
        <section>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Shield size={11} /> Account
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                <Shield size={14} className="text-gray-500" />
              </div>
              <span className="text-sm font-semibold text-gray-900 flex-1">Sign Out</span>
            </button>
            <button
              onClick={() => alert('Contact support@doornext.com to delete your account.')}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 size={14} className="text-red-400" />
              </div>
              <span className="text-sm font-semibold text-red-500 flex-1">Delete Account</span>
            </button>
          </div>
        </section>

      </div>

      <div className="py-8 text-center">
        <p className="text-xs text-gray-200">Doornext Maker v1.0.0</p>
      </div>
    </div>
  )
}
