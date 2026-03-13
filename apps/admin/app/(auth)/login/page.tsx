'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminLoginPage() {
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
      if (profile?.role !== 'admin') {
        await supabase.auth.signOut()
        setError('Access denied. Admin accounts only.')
        setLoading(false)
        return
      }
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black text-lg">D</span>
          </div>
          <h1 className="text-xl font-black text-gray-900">Admin Hub</h1>
          <p className="text-sm text-gray-400 mt-1">Operator access only</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF6B35] text-white rounded-lg py-3 text-sm font-bold disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
