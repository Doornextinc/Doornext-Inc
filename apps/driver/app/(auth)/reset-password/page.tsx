'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setSessionReady(true)
      else setSessionError(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setError(error.message); return }
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sessionError) {
    return (
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-orange-900/20 border border-orange-700/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={36} className="text-[#FF7A50]" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Link expired</h1>
        <p className="text-zinc-400 text-sm mb-8 max-w-xs mx-auto">
          This reset link has expired or already been used.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block bg-[#FF7A50] text-white font-bold px-8 py-4 rounded-xl text-sm"
        >
          Request New Link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-green-900/30 border border-green-700/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-400" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Password updated!</h1>
        <p className="text-zinc-400 text-sm">Redirecting you to sign in…</p>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin w-8 h-8 text-[#FF7A50]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FF7A50]/20 flex items-center justify-center mb-4">
          <Lock size={22} className="text-[#FF7A50]" />
        </div>
        <h1 className="text-2xl font-black text-white">Set new password</h1>
        <p className="text-zinc-400 text-sm mt-2">Choose a strong password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-1.5">
            New Password <span className="text-zinc-500 font-normal">(8+ characters)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoFocus
              placeholder="Create a new password"
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder:text-zinc-500 focus:border-[#FF7A50] focus:ring-2 focus:ring-[#FF7A50]/20 transition-all"
            />
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-1.5">Confirm Password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError('') }}
              placeholder="Repeat your password"
              className={`w-full bg-[#141414] border rounded-xl px-4 py-3 pr-12 text-white placeholder:text-zinc-500 focus:ring-2 transition-all
                ${confirmPassword && password !== confirmPassword
                  ? 'border-red-700/60 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-white/10 focus:border-[#FF7A50] focus:ring-[#FF7A50]/20'}`}
            />
            <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-400 mt-1.5">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || password !== confirmPassword}
          className="w-full bg-[#FF7A50] text-white rounded-xl py-4 font-bold text-base disabled:opacity-60 active:bg-[#E86B40] transition-colors flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : null}
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-8 h-8 text-[#FF7A50]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        }>
          <ResetPasswordContent />
        </Suspense>
      </div>
    </div>
  )
}
