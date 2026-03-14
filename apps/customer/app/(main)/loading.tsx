export default function Loading() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8f8f8] animate-pulse">
      {/* Top bar skeleton */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="h-6 w-32 bg-gray-200 rounded-lg mb-2" />
        <div className="h-4 w-24 bg-gray-100 rounded" />
      </div>

      {/* Card skeletons */}
      <div className="p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="h-36 bg-gray-200" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
