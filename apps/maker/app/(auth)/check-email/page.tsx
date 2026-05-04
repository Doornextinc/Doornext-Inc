'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function CheckEmailContent() {
  const params = useSearchParams()
  const email = params.get('email') ?? 'your email'

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#FF6B35]/25">
          <span className="text-4xl">📬</span>
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Check your inbox</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          We sent a verification link to{' '}
          <span className="font-semibold text-gray-700">{email}</span>.
          Click the link to verify your email, then we&apos;ll review your application.
        </p>

        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-left space-y-3 mb-8 shadow-sm">
          {[
            { step: '1', text: 'Open the email from Doornext' },
            { step: '2', text: 'Click the verification link' },
            { step: '3', text: 'We review your application (usually within 24 hours)' },
            { step: '4', text: 'You get notified and can start accepting orders' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-orange-50 border border-orange-100 text-[#FF6B35] text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                {step}
              </span>
              <p className="text-sm text-gray-600">{text}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          Didn&apos;t get an email? Check your spam folder or{' '}
          <Link href="/signup" className="text-[#FF6B35] font-semibold hover:underline">
            try signing up again
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  )
}
