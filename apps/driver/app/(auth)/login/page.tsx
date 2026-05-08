'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Inner component that safely reads search params (must be wrapped in Suspense)
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState(false)

  // Pre-fill email and show success banner when redirected from signup
  useEffect(() => {
    const prefill = searchParams.get('email')
    const created = searchParams.get('created')
    if (prefill) setEmail(decodeURIComponent(prefill))
    if (created === '1') setJustCreated(true)
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'driver') {
        await supabase.auth.signOut()
        setError('This account is not registered as a driver.')
        setLoading(false)
        return
      }
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/welcome" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
          <ChevronLeft size={16} />
          Back
        </Link>
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF7A50] to-[#FF9C78] flex items-center justify-center mb-4">
            <span className="text-white text-xl">🛵</span>
          </div>
          <h1 className="text-2xl font-black text-white">Welcome back</h1>
          <p className="text-zinc-400 text-sm mt-1">Sign in to your driver account</p>
        </div>

        {justCreated && (
          <div className="mb-4 p-3.5 bg-green-900/25 border border-green-700/40 rounded-xl flex items-start gap-2.5">
            <CheckCircle size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-300 font-medium leading-snug">
              Account created! Enter your password below to continue.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-[#FF7A50] focus:ring-2 focus:ring-[#FF7A50]/20 transition-all"
              placeholder="driver@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-zinc-300">Password</label>
              <Link href="/forgot-password" className="text-xs text-[#FF7A50] font-semibold hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-[#FF7A50] focus:ring-2 focus:ring-[#FF7A50]/20 transition-all"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF7A50] text-white rounded-xl py-4 font-bold text-base disabled:opacity-60 active:bg-[#E86B40] transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          New driver?{' '}
          <Link href="/signup" className="text-[#FF7A50] font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

// Default export wraps LoginForm in Suspense so useSearchParams() doesn't
// break static prerendering during `next build`.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
