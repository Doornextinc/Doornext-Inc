'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Mail, CheckCircle2 } from 'lucide-react'
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
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm mb-8 transition-colors"
        >
          <ChevronLeft size={16} />
          Back to sign in
        </Link>

        {!sent ? (
          <>
            <div className="mb-8">
              <div className="w-12 h-12 rounded-2xl bg-[#FF7A50]/20 flex items-center justify-center mb-4">
                <Mail size={22} className="text-[#FF7A50]" />
              </div>
              <h1 className="text-2xl font-black text-white">Forgot password?</h1>
              <p className="text-zinc-400 text-sm mt-2">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-400 text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 block mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  required
                  autoFocus
                  placeholder="driver@example.com"
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-[#FF7A50] focus:ring-2 focus:ring-[#FF7A50]/20 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-[#FF7A50] text-white rounded-xl py-4 font-bold text-base disabled:opacity-60 active:bg-[#E86B40] transition-colors flex items-center justify-center gap-2"
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
            <div className="w-20 h-20 bg-green-900/30 border border-green-700/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-green-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Check your inbox</h1>
            <p className="text-zinc-400 text-sm mb-2">We sent a password reset link to</p>
            <p className="font-bold text-white mb-6">{email}</p>
            <p className="text-xs text-zinc-500 mb-6">
              Didn&apos;t get it? Check your spam or{' '}
              <button onClick={() => setSent(false)} className="text-[#FF7A50] font-semibold">
                try again
              </button>
            </p>
            <Link href="/login" className="text-[#FF7A50] font-semibold text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
