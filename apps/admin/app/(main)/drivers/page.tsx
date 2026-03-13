import { createAdminClient } from '@/lib/supabase/server'

export default async function DriversPage() {
  const supabase = createAdminClient()
  const { data: drivers } = await supabase
    .from('driver_profiles')
    .select('id, full_name, vehicle_type, is_active, total_deliveries, avg_rating, created_at')
    .order('created_at', { ascending: false })

  const VEHICLE_ICONS: Record<string, string> = { car: '🚗', bike: '🚲', foot: '🚶' }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Drivers</h1>
        <span className="text-sm text-gray-400">{drivers?.length ?? 0} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Vehicle</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Deliveries</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(drivers ?? []).map((driver) => (
              <tr key={driver.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{driver.full_name}</td>
                <td className="px-5 py-3 text-gray-500">
                  {driver.vehicle_type
                    ? `${VEHICLE_ICONS[driver.vehicle_type] ?? ''} ${driver.vehicle_type}`
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {driver.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">{driver.total_deliveries}</td>
                <td className="px-5 py-3 text-right text-gray-600">
                  {driver.avg_rating > 0 ? `⭐ ${driver.avg_rating.toFixed(1)}` : '—'}
                </td>
                <td className="px-5 py-3 text-right text-xs text-gray-400">
                  {new Date(driver.created_at).toLocaleDateString('en-US', {
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
