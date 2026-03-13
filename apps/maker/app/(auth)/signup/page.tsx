'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const CUISINE_OPTIONS = [
  'American', 'Mexican', 'Italian', 'Chinese', 'Indian',
  'Thai', 'Japanese', 'Mediterranean', 'Soul Food', 'BBQ',
  'Vegan', 'Bakery', 'Desserts', 'Caribbean', 'Other',
]

export default function MakerSignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    displayName: '',
    cuisineTags: [] as string[],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const toggleCuisine = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      cuisineTags: prev.cuisineTags.includes(tag)
        ? prev.cuisineTags.filter((t) => t !== tag)
        : [...prev.cuisineTags, tag].slice(0, 5),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (!form.displayName.trim()) { setError('Kitchen name is required.'); return }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Signup failed. Please try again.')
      setLoading(false)
      return
    }

    // Sign in client-side
    const supabase = createClient()
    await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/welcome" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm mb-8 transition-colors">
          <ChevronLeft size={16} />
          Back
        </Link>

        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mb-4">
            <span className="text-white font-black text-lg">D</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Set up your kitchen</h1>
          <p className="text-gray-500 text-sm mt-1">Start selling your food on Doornext</p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kitchen Name</label>
              <input
                type="text"
                required
                value={form.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="Jane's Kitchen"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@example.com"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="At least 6 characters"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cuisine Types <span className="text-gray-400 font-normal">(pick up to 5)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleCuisine(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    form.cuisineTags.includes(tag)
                      ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-4 font-bold text-base disabled:opacity-60 transition-colors mt-2 shadow-lg shadow-[#FF6B35]/20"
          >
            {loading ? 'Setting up kitchen…' : 'Create Kitchen Account'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#FF6B35] font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
