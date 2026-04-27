'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Mail, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

/* ── helpers ── */
function looksLikePhone(val: string) {
  return /^[+\d\s\-().]{7,}$/.test(val.trim()) && /\d{7,}/.test(val)
}
function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('1') && d.length === 11) return `+${d}`
  if (d.length === 10) return `+1${d}`
  return `+${d}`
}

/* ── 6-box OTP input ── */
function OtpBoxes({ value, onChange, onComplete }: {
  value: string
  onChange: (v: string) => void
  onComplete?: () => void
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (i: number, char: string) => {
    if (!/^\d*$/.test(char)) return
    const arr = (value.padEnd(6, ' ')).split('').slice(0, 6)
    arr[i] = char.slice(-1) || ' '
    const next = arr.join('').replace(/ /g, '')
    onChange(next)
    if (char && i < 5) refs.current[i + 1]?.focus()
    if (next.length === 6) onComplete?.()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
    if (pasted.length === 6) onComplete?.()
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="tel"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`w-11 h-14 text-center text-xl font-black rounded-xl border-2 outline-none transition-colors
            ${value[i] ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200 bg-gray-50'}
            focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20`}
        />
      ))}
    </div>
  )
}

/* ── Google SVG ── */
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

type Step = 'identifier' | 'password' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [method, setMethod] = useState<'email' | 'phone'>('email')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  /* live phone/email detection */
  const handleIdentifierChange = useCallback((val: string) => {
    setIdentifier(val)
    setError('')
    setMethod(looksLikePhone(val) ? 'phone' : 'email')
  }, [])

  /* countdown ticker */
  const startCooldown = useCallback(() => {
    setResendCooldown(30)
    const t = setInterval(() => {
      setResendCooldown(n => { if (n <= 1) { clearInterval(t); return 0 } return n - 1 })
    }, 1000)
  }, [])

  /* ── Step 1: identifier continue ── */
  const handleContinue = async () => {
    if (!identifier.trim()) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      if (method === 'phone') {
        const phone = normalizePhone(identifier)
        const { error } = await supabase.auth.signInWithOtp({ phone })
        if (error) { setError(error.message); return }
        startCooldown()
        setStep('otp')
      } else {
        // Email path: go straight to password step (check happens at sign-in)
        setStep('password')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 2B: email password sign-in ── */
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password })
      if (error) { setError(error.message); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 2A: OTP verify ── */
  const handleOtpVerify = useCallback(async (code = otp) => {
    if (code.length < 6) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const phone = normalizePhone(identifier)
      const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
      if (error) { setError(error.message); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [otp, identifier, router])

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    const supabase = createClient()
    await supabase.auth.signInWithOtp({ phone: normalizePhone(identifier) })
    setOtp('')
    startCooldown()
  }

  const handleGoogleLogin = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    } catch { setError('Google sign-in failed.') }
  }

  /* ── Back nav ── */
  const back = () => {
    setError('')
    setPassword('')
    setOtp('')
    setStep('identifier')
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col min-h-screen bg-white px-6 py-10 max-w-md mx-auto">

      {/* Back arrow (steps 2+) */}
      {step !== 'identifier' && (
        <button onClick={back} className="self-start mb-6 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
      )}

      {/* ═══════════════════════════════ STEP: IDENTIFIER ═══════════════════════════════ */}
      {step === 'identifier' && (
        <>
          <div className="flex flex-col items-center mb-10 mt-2">
            <div className="w-16 h-16 bg-[#FF6B35] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-200">
              <span className="text-white text-2xl font-black">DN</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900">Welcome back</h1>
            <p className="text-gray-500 text-sm mt-1">Sign in to your Doornext account</p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Email or Phone
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {method === 'phone' ? <Phone size={16} /> : <Mail size={16} />}
                </div>
                <input
                  type="text"
                  inputMode={method === 'phone' ? 'tel' : 'email'}
                  autoComplete="username"
                  placeholder="you@example.com or (555) 000-0000"
                  value={identifier}
                  onChange={e => handleIdentifierChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleContinue()}
                  className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <Button onClick={handleContinue} loading={loading} disabled={!identifier.trim()} fullWidth size="lg">
              Continue
            </Button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-sm">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm active:bg-gray-50 transition-colors">
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center text-gray-500 text-sm mt-8">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[#FF6B35] font-semibold">Sign up</Link>
          </p>
        </>
      )}

      {/* ═══════════════════════════════ STEP: PASSWORD ═══════════════════════════════ */}
      {step === 'password' && (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-black text-gray-900">Enter your password</h1>
            <p className="text-gray-500 text-sm mt-1">
              Signing in as <span className="font-semibold text-gray-700">{identifier}</span>
            </p>
          </div>

          <form onSubmit={handleEmailSignIn} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Password</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password"
                  autoFocus
                  className="w-full pl-10 pr-12 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Link href="/forgot-password" className="text-sm text-[#FF6B35] font-semibold self-end -mt-1">
              Forgot password?
            </Link>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <Button type="submit" loading={loading} disabled={!password} fullWidth size="lg">
              Sign In
            </Button>
          </form>
        </>
      )}

      {/* ═══════════════════════════════ STEP: OTP ═══════════════════════════════ */}
      {step === 'otp' && (
        <>
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone size={28} className="text-[#FF6B35]" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Check your phone</h1>
            <p className="text-gray-500 text-sm mt-2">
              We sent a 6-digit code to{' '}
              <span className="font-semibold text-gray-700">{normalizePhone(identifier)}</span>
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <OtpBoxes value={otp} onChange={v => { setOtp(v); setError('') }} onComplete={handleOtpVerify} />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">{error}</div>
            )}

            <Button onClick={() => handleOtpVerify()} loading={loading} disabled={otp.length < 6} fullWidth size="lg">
              Verify
            </Button>

            <button
              onClick={handleResendOtp}
              disabled={resendCooldown > 0}
              className="text-center text-sm text-gray-500 disabled:opacity-50"
            >
              {resendCooldown > 0
                ? <span className="text-gray-400">Resend in {resendCooldown}s</span>
                : <><span>Didn&apos;t receive it? </span><span className="text-[#FF6B35] font-semibold">Resend code</span></>
              }
            </button>
          </div>
        </>
      )}
    </div>
  )
}
