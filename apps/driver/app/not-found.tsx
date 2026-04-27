import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 text-sm mb-6">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/"
        className="bg-gray-900 text-white font-semibold px-6 py-3 rounded-xl text-sm"
      >
        Go home
      </Link>
    </div>
  )
}
