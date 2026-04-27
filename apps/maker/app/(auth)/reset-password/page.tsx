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
      if (session) {
        setSessionReady(true)
      } else {
        setSessionError(true)
      }
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
        <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={36} className="text-[#FF6B35]" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Link expired</h1>
        <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto">
          This reset link has expired or already been used.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block bg-[#FF6B35] text-white font-black px-8 py-4 rounded-xl text-sm shadow-lg shadow-[#FF6B35]/25"
        >
          Request New Link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Password updated!</h1>
        <p className="text-gray-400 text-sm">Redirecting you to sign in…</p>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin w-8 h-8 text-[#FF6B35]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[#FF6B35]/10 flex items-center justify-center mb-5">
          <Lock size={24} className="text-[#FF6B35]" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Set new password</h1>
        <p className="text-gray-400 text-sm mt-2">Choose a strong password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
            New Password <span className="text-gray-400 font-normal normal-case">(8+ chars)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoFocus
              placeholder="Create a new password"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 pr-12 text-[15px] text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
            />
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError('') }}
              placeholder="Repeat your password"
              className={`w-full bg-white border rounded-xl px-4 py-3.5 pr-12 text-[15px] text-gray-900 focus:outline-none transition-colors
                ${confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-[#FF6B35]'}`}
            />
            <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500 mt-1.5">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="px-4 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || password !== confirmPassword}
          className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-4 font-black text-[15px] disabled:opacity-50 active:opacity-90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B35]/25 mt-1"
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-8 h-8 text-[#FF6B35]" viewBox="0 0 24 24" fill="none">
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
