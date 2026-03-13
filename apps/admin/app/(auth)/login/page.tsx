'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Users, ShoppingBag, Settings } from 'lucide-react'

const FEATURES = [
  { icon: ShoppingBag, label: 'Order Management', desc: 'Monitor and manage all orders in real time' },
  { icon: Users, label: 'User Controls', desc: 'Manage customers, makers, and drivers' },
  { icon: BarChart3, label: 'Revenue Analytics', desc: 'Track platform earnings and trends' },
  { icon: Settings, label: 'Platform Settings', desc: 'Configure fees, limits, and policies' },
]

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
    <div className="min-h-screen flex">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-gray-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
            <span className="text-white font-black text-sm">D</span>
          </div>
          <span className="text-white font-black text-lg">Doornext Admin</span>
        </div>

        <div>
          <h1 className="text-4xl font-black text-white mb-4 leading-tight">
            The control center<br />
            <span className="text-[#FF6B35]">for your marketplace.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-12">
            Monitor orders, manage users, and configure your platform from one place.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-gray-800 rounded-2xl p-4">
                <div className="w-9 h-9 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center mb-3">
                  <Icon size={18} className="text-[#FF6B35]" />
                </div>
                <p className="font-bold text-white text-sm mb-1">{label}</p>
                <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-600 text-xs">© {new Date().getFullYear()} Doornext. Operator access only.</p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
              <span className="text-white font-black text-xs">D</span>
            </div>
            <span className="text-gray-900 font-black">Doornext Admin</span>
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">Sign in</h2>
          <p className="text-gray-400 text-sm mb-8">Admin operator access only</p>

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all bg-gray-50 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all bg-gray-50 focus:bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-3.5 text-sm font-bold disabled:opacity-60 transition-colors shadow-lg shadow-[#FF6B35]/20 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold mb-1">Need an admin account?</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Run this in your Supabase SQL Editor after creating the user:
            </p>
            <code className="block bg-gray-100 px-3 py-2 rounded-lg text-gray-600 text-[11px] mt-2 font-mono">
              UPDATE users SET role = &apos;admin&apos;<br />
              WHERE email = &apos;you@example.com&apos;;
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
