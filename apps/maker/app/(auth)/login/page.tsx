'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Incorrect email or password.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'maker') {
        await supabase.auth.signOut()
        setError('This account is not registered as a food maker.')
        setLoading(false)
        return
      }
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F5F4F2] flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[#111] flex items-center justify-center mx-auto mb-5">
            <span className="text-white font-black text-xl">D</span>
          </div>
          <h1 className="text-2xl font-black text-[#111]">Welcome back</h1>
          <p className="text-[#999] text-sm mt-1">Sign in to your kitchen dashboard</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-white border border-[#E8E8E8] rounded-xl px-4 py-3.5 text-[15px] text-[#111] focus:outline-none focus:border-[#111] transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#666] mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white border border-[#E8E8E8] rounded-xl px-4 py-3.5 text-[15px] text-[#111] focus:outline-none focus:border-[#111] transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#111] text-white rounded-xl py-4 font-black text-[15px] disabled:opacity-50 active:bg-[#333] transition-colors mt-1 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[#AAA] text-sm mt-6">
          New maker?{' '}
          <Link href="/signup" className="text-[#111] font-bold">
            Apply to sell
          </Link>
        </p>
      </div>
    </div>
  )
}
