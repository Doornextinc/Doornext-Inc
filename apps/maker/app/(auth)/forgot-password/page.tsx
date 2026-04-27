'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">

        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-gray-500 font-medium mb-8 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </Link>

        {!sent ? (
          <>
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#FF6B35]/10 flex items-center justify-center mb-5">
                <Mail size={24} className="text-[#FF6B35]" />
              </div>
              <h1 className="text-2xl font-black text-gray-900">Forgot password?</h1>
              <p className="text-gray-400 text-sm mt-2">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  required
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-[15px] text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-4 font-black text-[15px] disabled:opacity-50 active:opacity-90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B35]/25"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : null}
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Check your inbox</h1>
            <p className="text-gray-400 text-sm mb-2">We sent a password reset link to</p>
            <p className="font-bold text-gray-800 mb-6">{email}</p>
            <p className="text-xs text-gray-400 mb-6">
              Didn&apos;t get it? Check your spam folder or{' '}
              <button onClick={() => setSent(false)} className="text-[#FF6B35] font-semibold">
                try again
              </button>
            </p>
            <Link href="/login" className="text-[#FF6B35] font-bold text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
