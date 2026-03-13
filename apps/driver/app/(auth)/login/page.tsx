'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl">🛵</span>
          </div>
          <h1 className="text-2xl font-black text-white">Driver App</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to start delivering</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
              placeholder="driver@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF6B35] text-white rounded-xl py-4 font-bold text-base disabled:opacity-60 active:bg-[#E55A24] transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
