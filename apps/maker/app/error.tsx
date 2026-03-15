'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center px-6">
          <div className="w-20 h-20 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center mb-5">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Something went wrong</h1>
          <p className="text-gray-400 text-sm mt-2 mb-6">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-[#FF6B35] text-white rounded-2xl font-bold text-sm shadow-md shadow-[#FF6B35]/30"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
