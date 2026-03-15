import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center px-6">
      <div className="w-20 h-20 rounded-3xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-5">
        <span className="text-4xl">🍽️</span>
      </div>
      <h1 className="text-4xl font-black text-gray-900">404</h1>
      <p className="text-gray-500 font-semibold mt-1">Page not found</p>
      <p className="text-gray-400 text-sm mt-2 mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="px-6 py-3 bg-[#FF6B35] text-white rounded-2xl font-bold text-sm shadow-md shadow-[#FF6B35]/30"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
