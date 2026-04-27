'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

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

  /* Supabase sends the recovery token in the URL hash (#access_token=...)
     or as a ?code= param. The client SDK handles the hash automatically
     when the page loads — we just need to check if a session exists. */
  useEffect(() => {
    const supabase = createClient()
    // Give the SDK a moment to exchange the hash token
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
      } else {
        // Check for error in URL params
        const errorParam = searchParams.get('error')
        if (errorParam) {
          setSessionError(true)
        } else {
          setSessionError(true)
        }
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
      setTimeout(() => { router.push('/login') }, 3000)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Invalid / expired link ── */
  if (sessionError) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
        <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={36} className="text-[#FF6B35]" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Link expired</h1>
        <p className="text-gray-500 text-sm mb-8 max-w-xs">
          This password reset link has expired or already been used. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="bg-[#FF6B35] text-white font-bold px-8 py-4 rounded-2xl text-sm active:scale-[0.98] transition-all"
        >
          Request New Link
        </Link>
      </div>
    )
  }

  /* ── Success ── */
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Password updated!</h1>
        <p className="text-gray-500 text-sm mb-2">Your password has been changed successfully.</p>
        <p className="text-xs text-gray-400">Redirecting to sign in...</p>
      </div>
    )
  }

  /* ── Loading session ── */
  if (!sessionReady && !sessionError) {
    return (
      <div className="flex flex-col items-center justify-center flex-1">
        <div className="w-8 h-8 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  /* ── Password form ── */
  return (
    <>
      <div className="mb-8">
        <div className="w-14 h-14 bg-[#FF6B35]/10 rounded-2xl flex items-center justify-center mb-5">
          <Lock size={24} className="text-[#FF6B35]" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Set new password</h1>
        <p className="text-gray-500 text-sm mt-2">Choose a strong password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
            New Password <span className="text-gray-400 font-normal normal-case">(8+ characters)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a new password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete="new-password"
              autoFocus
              className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
            />
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirm New Password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError('') }}
              autoComplete="new-password"
              className={`w-full pl-4 pr-12 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium outline-none transition-colors
                ${confirmPassword && password !== confirmPassword ? 'border-red-300' : 'border-gray-100 focus:border-[#FF6B35]'}`}
            />
            <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <Button
          type="submit"
          loading={loading}
          disabled={!password || password !== confirmPassword}
          fullWidth
          size="lg"
        >
          Update Password
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white px-6 py-10 max-w-md mx-auto">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="w-8 h-8 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <ResetPasswordContent />
      </Suspense>
    </div>
  )
}
