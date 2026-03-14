'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-500 text-sm mb-6">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="bg-[#FF6B35] text-white font-semibold px-6 py-3 rounded-xl text-sm"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
