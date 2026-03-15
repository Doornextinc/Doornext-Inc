'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
    router.push('/available')
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
            <label className="text-sm font-medium text-zinc-300 block mb-1.5">Password</label>
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
