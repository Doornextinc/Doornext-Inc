'use client'

import { useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

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
          autoFocus={i === 0}
          className={`w-11 h-14 text-center text-xl font-black rounded-xl border-2 outline-none transition-colors
            ${value[i] ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200 bg-gray-50'}
            focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20`}
        />
      ))}
    </div>
  )
}

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendSuccess, setResendSuccess] = useState(false)

  const startCooldown = useCallback(() => {
    setResendCooldown(30)
    const t = setInterval(() => {
      setResendCooldown(n => { if (n <= 1) { clearInterval(t); return 0 } return n - 1 })
    }, 1000)
  }, [])

  const handleVerify = useCallback(async (token = code) => {
    if (token.length < 6) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }, [code, email, router])

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setResendSuccess(false)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setCode('')
    setResendSuccess(true)
    startCooldown()
    setTimeout(() => setResendSuccess(false), 3000)
  }

  return (
    <div className="flex flex-col min-h-screen bg-white px-6 py-10 max-w-md mx-auto items-center">
      <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-full flex items-center justify-center mb-6 mt-10">
        <Mail size={28} className="text-[#FF6B35]" />
      </div>
      <h1 className="text-2xl font-black text-gray-900 mb-2">Check your email</h1>
      <p className="text-gray-500 text-sm text-center mb-10">
        We sent a 6-digit code to{' '}
        <span className="font-semibold text-gray-700">{email}</span>
      </p>

      <div className="w-full flex flex-col gap-6">
        <OtpBoxes
          value={code}
          onChange={v => { setCode(v); setError('') }}
          onComplete={handleVerify}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {resendSuccess && (
          <p className="text-center text-sm text-green-600 font-medium">Code resent! Check your inbox.</p>
        )}

        <Button
          onClick={() => handleVerify()}
          loading={loading}
          disabled={code.length < 6}
          fullWidth
          size="lg"
        >
          Verify Email
        </Button>

        <button
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="text-center text-sm text-gray-500 disabled:opacity-50"
        >
          {resendCooldown > 0
            ? <span className="text-gray-400">Resend in {resendCooldown}s</span>
            : <><span>Didn&apos;t receive it? </span><span className="text-[#FF6B35] font-semibold">Resend code</span></>
          }
        </button>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  )
}
