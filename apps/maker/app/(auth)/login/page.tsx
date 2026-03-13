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

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Verify maker role
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'maker') {
        await supabase.auth.signOut()
        setError('This account is not registered as a food maker.')
        setLoading(false)
        return
      }
    }

    router.push('/')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/welcome" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm mb-8 transition-colors">
          <ChevronLeft size={16} />
          Back
        </Link>
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mb-4">
            <span className="text-white font-black text-lg">D</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your kitchen dashboard</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
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

        <p className="text-center text-gray-400 text-sm mt-6">
          New maker?{' '}
          <Link href="/signup" className="text-[#FF6B35] font-semibold hover:underline">
            Apply to sell
          </Link>
        </p>
      </div>
    </div>
  )
}
