'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Authentication is not configured. Please check your Supabase environment variables.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    } catch {
      setError('Authentication is not configured. Please check your Supabase environment variables.')
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-6 py-10">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10 mt-6">
        <div className="w-16 h-16 bg-[#FF6B35] rounded-2xl flex items-center justify-center mb-4">
          <span className="text-white text-2xl font-black">DN</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to your Doornext account</p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail size={16} />}
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock size={16} />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
          Sign In
        </Button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-gray-400 text-sm">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Google */}
      <button
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-base active:bg-gray-50 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      {/* Sign up link */}
      <p className="text-center text-gray-500 text-sm mt-8">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-[#FF6B35] font-semibold">
          Sign up
        </Link>
      </p>
    </div>
  )
}
