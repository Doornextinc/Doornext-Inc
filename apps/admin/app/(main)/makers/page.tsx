import { createAdminClient } from '@/lib/supabase/server'

export default async function MakersPage() {
  const supabase = createAdminClient()
  const { data: makers } = await supabase
    .from('food_makers')
    .select('id, display_name, cuisine_tags, avg_rating, total_reviews, is_open, created_at, user_id')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Food Makers</h1>
        <span className="text-sm text-gray-400">{makers?.length ?? 0} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Cuisines</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(makers ?? []).map((maker) => (
              <tr key={maker.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{maker.display_name}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {maker.cuisine_tags?.slice(0, 2).map((tag: string) => (
                      <span key={tag} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-600">
                  ⭐ {maker.avg_rating?.toFixed(1) ?? '—'} ({maker.total_reviews})
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    maker.is_open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {maker.is_open ? 'Open' : 'Closed'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-xs text-gray-400">
                  {new Date(maker.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
