'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (error) { setError(error.message); return }
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white px-6 py-10 max-w-md mx-auto">
      <Link
        href="/login"
        className="self-start mb-6 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
      >
        <ArrowLeft size={18} className="text-gray-700" />
      </Link>

      {!sent ? (
        <>
          <div className="mb-8">
            <div className="w-14 h-14 bg-[#FF6B35]/10 rounded-2xl flex items-center justify-center mb-5">
              <Mail size={24} className="text-[#FF6B35]" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Forgot password?</h1>
            <p className="text-gray-500 text-sm mt-2">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} disabled={!email.trim()} fullWidth size="lg">
              Send Reset Link
            </Button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-8">
            Remember your password?{' '}
            <Link href="/login" className="text-[#FF6B35] font-semibold">Sign in</Link>
          </p>
        </>
      ) : (
        /* ── Success state ── */
        <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Check your inbox</h1>
          <p className="text-gray-500 text-sm mb-2">
            We sent a password reset link to
          </p>
          <p className="font-semibold text-gray-800 mb-8">{email}</p>
          <p className="text-xs text-gray-400 mb-8 max-w-xs">
            Didn&apos;t get it? Check your spam folder or{' '}
            <button onClick={() => setSent(false)} className="text-[#FF6B35] font-semibold">
              try again
            </button>
          </p>
          <Link href="/login" className="text-[#FF6B35] font-semibold text-sm">
            Back to sign in
          </Link>
        </div>
      )}
    </div>
  )
}
