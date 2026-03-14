import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
      <div className="text-6xl mb-4">🍽️</div>
      <h1 className="text-2xl font-black text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 text-sm mb-6">
        This page doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="bg-[#FF6B35] text-white font-semibold px-6 py-3 rounded-xl text-sm"
      >
        Back to home
      </Link>
    </div>
  )
}
