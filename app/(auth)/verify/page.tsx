'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleResend = async () => {
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResent(true)
    setTimeout(() => setResent(false), 30000)
  }

  return (
    <div className="flex flex-col min-h-screen px-6 py-10 items-center">
      <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-full flex items-center justify-center mb-6 mt-10">
        <Mail size={28} className="text-[#FF6B35]" />
      </div>
      <h1 className="text-2xl font-black text-gray-900 mb-2">Check your email</h1>
      <p className="text-gray-500 text-sm text-center mb-8">
        We sent a 6-digit code to{' '}
        <span className="font-semibold text-gray-700">{email}</span>
      </p>

      <form onSubmit={handleVerify} className="w-full flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full text-center text-3xl font-black tracking-[0.5em] bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
          required
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          fullWidth
          size="lg"
          disabled={code.length < 6}
        >
          Verify Email
        </Button>
      </form>

      <button
        onClick={handleResend}
        disabled={resent}
        className="mt-6 text-sm text-gray-500"
      >
        {resent ? (
          <span className="text-green-600 font-medium">Code resent!</span>
        ) : (
          <>
            Didn&apos;t receive it?{' '}
            <span className="text-[#FF6B35] font-semibold">Resend code</span>
          </>
        )}
      </button>
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
