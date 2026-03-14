'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    Sentry.captureException(error)
    console.error('[MainError]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
      <div className="text-5xl mb-4">😕</div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
      <p className="text-gray-500 text-sm mb-6">
        An unexpected error occurred. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-[#FF6B35] text-white font-semibold px-5 py-3 rounded-xl text-sm"
        >
          Try again
        </button>
        <button
          onClick={() => router.push('/')}
          className="bg-gray-100 text-gray-700 font-semibold px-5 py-3 rounded-xl text-sm"
        >
          Go home
        </button>
      </div>
    </div>
  )
}
