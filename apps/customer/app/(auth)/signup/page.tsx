'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Mail, Phone, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

/* ── helpers ── */
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

/* ── Step progress dots ── */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-[#FF6B35]' : i < current ? 'w-3 bg-[#FF6B35]/40' : 'w-3 bg-gray-200'}`} />
      ))}
    </div>
  )
}

type SignupMethod = 'email' | 'phone'
type Step = 'method' | 'name' | 'credentials' | 'phone' | 'otp' | 'done'

const EMAIL_STEPS: Step[] = ['method', 'name', 'credentials']
const PHONE_STEPS: Step[] = ['method', 'name', 'phone', 'otp']

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('method')
  const [signupMethod, setSignupMethod] = useState<SignupMethod>('email')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const steps = signupMethod === 'email' ? EMAIL_STEPS : PHONE_STEPS
  const stepIndex = steps.indexOf(step)

  const startCooldown = useCallback(() => {
    setResendCooldown(30)
    const t = setInterval(() => {
      setResendCooldown(n => { if (n <= 1) { clearInterval(t); return 0 } return n - 1 })
    }, 1000)
  }, [])

  const goBack = () => {
    setError('')
    const prev = steps[stepIndex - 1]
    if (prev) setStep(prev)
    else setStep('method')
  }

  /* ── Method selection ── */
  const handleMethodSelect = (m: SignupMethod) => {
    setSignupMethod(m)
    setError('')
    setStep('name')
  }

  const handleGoogleSignup = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    } catch { setError('Google sign-in failed.') }
  }

  /* ── Name step ── */
  const handleNameContinue = () => {
    if (!fullName.trim()) { setError('Please enter your name.'); return }
    setError('')
    setStep(signupMethod === 'email' ? 'credentials' : 'phone')
  }

  /* ── Email + password step ── */
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) { setError(error.message); return }
      router.push('/verify?email=' + encodeURIComponent(email))
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Phone step ── */
  const handlePhoneContinue = async () => {
    const normalized = normalizePhone(phone)
    if (normalized.replace(/\D/g, '').length < 10) { setError('Please enter a valid phone number.'); return }
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: { data: { full_name: fullName } },
      })
      if (error) { setError(error.message); return }
      startCooldown()
      setStep('otp')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── OTP verify ── */
  const handleOtpVerify = useCallback(async (code = otp) => {
    if (code.length < 6) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone),
        token: code,
        type: 'sms',
      })
      if (error) { setError(error.message); return }
      setStep('done')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [otp, phone])

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    const supabase = createClient()
    await supabase.auth.signInWithOtp({ phone: normalizePhone(phone) })
    setOtp('')
    startCooldown()
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col min-h-screen bg-white px-6 py-10 max-w-md mx-auto">

      {/* Back arrow (steps after method) */}
      {step !== 'method' && step !== 'done' && (
        <button onClick={goBack} className="self-start mb-4 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
      )}

      {/* Progress dots (skip method/done) */}
      {step !== 'method' && step !== 'done' && (
        <StepDots total={steps.length - 1} current={stepIndex - 1} />
      )}

      {/* ══════════════════ METHOD ══════════════════ */}
      {step === 'method' && (
        <>
          <div className="flex flex-col items-center mb-10 mt-2">
            <div className="w-16 h-16 bg-[#FF6B35] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-200">
              <span className="text-white text-2xl font-black">DN</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900">Create account</h1>
            <p className="text-gray-500 text-sm mt-1">Join Doornext today</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleMethodSelect('email')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 bg-gray-50 active:bg-orange-50 active:border-[#FF6B35] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
                <Mail size={18} className="text-[#FF6B35]" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">Continue with Email</p>
                <p className="text-xs text-gray-400 mt-0.5">Use your email address</p>
              </div>
            </button>

            <button
              onClick={() => handleMethodSelect('phone')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 bg-gray-50 active:bg-orange-50 active:border-[#FF6B35] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
                <Phone size={18} className="text-[#FF6B35]" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">Continue with Phone</p>
                <p className="text-xs text-gray-400 mt-0.5">Verify with a text message</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-sm">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button onClick={handleGoogleSignup} className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm active:bg-gray-50 transition-colors">
            <GoogleIcon />
            Continue with Google
          </button>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <p className="text-center text-gray-500 text-sm mt-8">
            Already have an account?{' '}
            <Link href="/login" className="text-[#FF6B35] font-semibold">Sign in</Link>
          </p>
        </>
      )}

      {/* ══════════════════ NAME ══════════════════ */}
      {step === 'name' && (
        <>
          <h1 className="text-2xl font-black text-gray-900 mb-1">What&apos;s your name?</h1>
          <p className="text-gray-500 text-sm mb-8">We&apos;ll use this on your profile</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Full Name</label>
              <input
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={e => { setFullName(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleNameContinue()}
                autoComplete="name"
                autoFocus
                className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Button onClick={handleNameContinue} disabled={!fullName.trim()} fullWidth size="lg">
              Continue
            </Button>
          </div>
        </>
      )}

      {/* ══════════════════ EMAIL + PASSWORD ══════════════════ */}
      {step === 'credentials' && (
        <>
          <h1 className="text-2xl font-black text-gray-900 mb-1">Set up your email</h1>
          <p className="text-gray-500 text-sm mb-8">Hi {fullName.split(' ')[0]}! Enter your email and a password.</p>

          <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Password <span className="text-gray-400 font-normal normal-case">(8+ characters)</span></label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="new-password"
                  className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                  autoComplete="new-password"
                  className={`w-full pl-4 pr-12 py-3.5 bg-gray-50 border-2 rounded-xl text-sm font-medium outline-none transition-colors
                    ${confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-400' : 'border-gray-100 focus:border-[#FF6B35]'}`}
                />
                <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
              )}
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <p className="text-xs text-gray-400 text-center">
              By continuing, you agree to our{' '}
              <span className="text-[#FF6B35]">Terms</span> and{' '}
              <span className="text-[#FF6B35]">Privacy Policy</span>
            </p>

            <Button
              type="submit"
              loading={loading}
              disabled={!email || !password || password !== confirmPassword}
              fullWidth
              size="lg"
            >
              Create Account
            </Button>
          </form>
        </>
      )}

      {/* ══════════════════ PHONE NUMBER ══════════════════ */}
      {step === 'phone' && (
        <>
          <h1 className="text-2xl font-black text-gray-900 mb-1">Enter your phone</h1>
          <p className="text-gray-500 text-sm mb-8">We&apos;ll send you a verification code</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Phone Number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handlePhoneContinue()}
                  autoComplete="tel"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Button onClick={handlePhoneContinue} loading={loading} disabled={phone.replace(/\D/g, '').length < 10} fullWidth size="lg">
              Send Code
            </Button>
          </div>
        </>
      )}

      {/* ══════════════════ OTP ══════════════════ */}
      {step === 'otp' && (
        <>
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone size={28} className="text-[#FF6B35]" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Verify your number</h1>
            <p className="text-gray-500 text-sm mt-2">
              Code sent to <span className="font-semibold text-gray-700">{normalizePhone(phone)}</span>
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <OtpBoxes value={otp} onChange={v => { setOtp(v); setError('') }} onComplete={handleOtpVerify} />

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">{error}</div>}

            <Button onClick={() => handleOtpVerify()} loading={loading} disabled={otp.length < 6} fullWidth size="lg">
              Verify &amp; Continue
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

      {/* ══════════════════ DONE (phone path) ══════════════════ */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">You&apos;re in!</h1>
          <p className="text-gray-500 text-sm mb-8">
            Welcome to Doornext,{' '}
            <span className="font-semibold text-gray-700">{fullName.split(' ')[0]}</span>!
          </p>
          <Button onClick={() => { router.push('/'); router.refresh() }} fullWidth size="lg">
            Start Ordering 🛵
          </Button>
        </div>
      )}
    </div>
  )
}
