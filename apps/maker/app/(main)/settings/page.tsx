'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2, Lock, User, Bell, Shield, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [profile, setProfile] = useState({ display_name: '', bio: '' })
  const [password, setPassword] = useState({ new: '', confirm: '' })
  const [notifications, setNotifications] = useState({
    newOrders: true,
    soundEnabled: true,
  })
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? '')

      const { data: maker } = await supabase
        .from('food_makers')
        .select('display_name, bio')
        .eq('user_id', user.id)
        .single()

      if (maker) setProfile({ display_name: maker.display_name ?? '', bio: maker.bio ?? '' })
      setLoading(false)
    }
    load()
  }, [router])

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
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
    if (password.new !== password.confirm) { flash('err', 'Passwords don\'t match'); return }
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
      <div className="flex flex-col min-h-full bg-[#F5F4F2]">
        <div className="bg-white px-4 h-[60px] flex items-center border-b border-[#EBEBEB]">
          <div className="h-5 bg-[#EBEBEB] rounded w-20 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#F5F4F2]">
      <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] px-4 h-[60px] flex items-center gap-3">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-[#555]" />
        </button>
        <h1 className="text-[18px] font-black text-[#111]">Settings</h1>
      </header>

      {/* Flash message */}
      {msg && (
        <div className={`mx-4 mt-4 px-4 py-3 rounded-2xl text-sm font-semibold ${
          msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* Kitchen Profile */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <User size={11} /> Kitchen Profile
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Kitchen Name</label>
              <input
                type="text"
                value={profile.display_name}
                onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))}
                className="w-full bg-[#F8F7F5] border border-[#E8E8E8] rounded-xl px-3.5 py-3 text-sm text-[#111] focus:outline-none focus:border-[#111] transition-colors"
                placeholder="Jane's Kitchen"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Bio</label>
              <textarea
                value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                rows={3}
                className="w-full bg-[#F8F7F5] border border-[#E8E8E8] rounded-xl px-3.5 py-3 text-sm text-[#111] focus:outline-none focus:border-[#111] transition-colors resize-none"
                placeholder="Tell customers about your kitchen…"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Email</label>
              <input
                disabled
                value={email}
                className="w-full bg-[#F0F0F0] border border-[#E8E8E8] rounded-xl px-3.5 py-3 text-sm text-[#AAA]"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full bg-[#111] text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Bell size={11} /> Notifications
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2]">
            {[
              { key: 'newOrders' as const, label: 'New order alerts', desc: 'Notify when a new order arrives' },
              { key: 'soundEnabled' as const, label: 'Sound alerts', desc: 'Play a sound for new orders' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-[#111]">{label}</p>
                  <p className="text-xs text-[#AAA] mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setNotifications(n => ({ ...n, [key]: !n[key] }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifications[key] ? 'bg-[#111]' : 'bg-[#DADADA]'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${notifications[key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Lock size={11} /> Security
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">New Password</label>
              <input
                type="password"
                value={password.new}
                onChange={e => setPassword(p => ({ ...p, new: e.target.value }))}
                className="w-full bg-[#F8F7F5] border border-[#E8E8E8] rounded-xl px-3.5 py-3 text-sm text-[#111] focus:outline-none focus:border-[#111] transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Confirm Password</label>
              <input
                type="password"
                value={password.confirm}
                onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))}
                className="w-full bg-[#F8F7F5] border border-[#E8E8E8] rounded-xl px-3.5 py-3 text-sm text-[#111] focus:outline-none focus:border-[#111] transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !password.new}
              className="w-full bg-[#111] text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {changingPassword && <Loader2 size={14} className="animate-spin" />}
              Change Password
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <Shield size={11} /> Account
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2]">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <div className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center">
                <Shield size={14} className="text-[#666]" />
              </div>
              <span className="text-sm font-semibold text-[#111] flex-1">Sign Out</span>
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
        <p className="text-xs text-[#DDD]">Doornext Maker v1.0.0</p>
      </div>
    </div>
  )
}
