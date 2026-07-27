'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const VEHICLE_OPTIONS = [
  { value: 'car',       label: '🚗', name: 'Car',       desc: 'Sedan, SUV, pickup' },
  { value: 'motorbike', label: '🏍️',  name: 'Motorbike', desc: 'Motorcycle, scooter' },
  { value: 'bicycle',   label: '🚲', name: 'Bicycle',   desc: 'Push bike, e-bike' },
  { value: 'foot',      label: '🚶', name: 'On Foot',   desc: 'Walking delivery' },
]

const inp = 'w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all outline-none'

export default function DriverSignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '', vehicleType: 'car' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.phone.length < 10) { setError('Please enter a valid phone number.'); return }
    setLoading(true); setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: form.fullName, email: form.email, phone: form.phone, password: form.password, vehicleType: form.vehicleType }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Signup failed. Please try again.'); setLoading(false); return }

    // Auto sign-in — succeeds because email_confirm: true is set server-side
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (signInError) {
      // Account was created but session couldn't be established — redirect to
      // login so the driver can sign in manually without losing their account.
      router.push(`/login?email=${encodeURIComponent(form.email)}&created=1`)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/welcome" className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface text-sm mb-8 transition-colors">
          <ChevronLeft size={16} /> Back
        </Link>

        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-container to-primary-fixed-dim flex items-center justify-center mb-4">
            <span className="text-2xl">🛵</span>
          </div>
          <h1 className="text-2xl font-black text-on-surface">Create driver account</h1>
          <p className="text-on-surface-variant text-sm mt-1">You'll verify your identity in the next step</p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-error-container border border-error/30 rounded-xl text-sm text-error">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Full Name</label>
              <input type="text" required value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Jane Smith" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Phone</label>
              <input type="tel" required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555-0100" className={inp} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5">Email</label>
            <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Password</label>
              <input type="password" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 chars" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Confirm</label>
              <input type="password" required value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Repeat" className={inp} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">Vehicle Type</label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_OPTIONS.map(({ value, label, name, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('vehicleType', value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    form.vehicleType === value
                      ? 'border-primary-container bg-primary-fixed'
                      : 'border-outline-variant/40 bg-surface-container-lowest hover:border-slate-600'
                  }`}
                >
                  <span className="text-2xl leading-none">{label}</span>
                  <div>
                    <p className={`text-sm font-bold leading-tight ${form.vehicleType === value ? 'text-primary' : 'text-on-surface'}`}>{name}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
            {['car', 'motorbike'].includes(form.vehicleType) && (
              <p className="text-[11px] text-yellow-500/80 mt-2 px-1 flex items-center gap-1.5">
                <span>⚠️</span> Insurance document required during verification
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container hover:bg-primary text-on-primary rounded-xl py-4 font-bold text-base disabled:opacity-60 transition-colors mt-2 shadow-lg shadow-primary-container/20"
          >
            {loading ? 'Creating account…' : 'Create Account & Continue'}
          </button>
        </form>

        <p className="text-center text-on-surface-variant text-sm mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
