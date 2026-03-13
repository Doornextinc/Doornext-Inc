'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp } from 'lucide-react'

export default function EarningsPage() {
  const router = useRouter()
  const [deliveries, setDeliveries] = useState<Array<{ id: string; delivery_fee: number; created_at: string }>>([])
  const [profile, setProfile] = useState<{ total_deliveries: number; avg_rating: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [ordersRes, profileRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, delivery_fee, created_at')
          .eq('nexter_id', user.id)
          .eq('status', 'delivered')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('driver_profiles').select('total_deliveries, avg_rating').eq('id', user.id).single(),
      ])

      setDeliveries(ordersRes.data ?? [])
      setProfile(profileRes.data)
      setLoading(false)
    }
    load()
  }, [router])

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString()

  const todayTotal = deliveries
    .filter((d) => d.created_at >= startOfDay)
    .reduce((s, d) => s + d.delivery_fee, 0)
  const weekTotal = deliveries
    .filter((d) => d.created_at >= startOfWeek)
    .reduce((s, d) => s + d.delivery_fee, 0)

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 h-14 flex items-center">
        <h1 className="text-lg font-black text-white">Earnings</h1>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Today</p>
              <p className="text-2xl font-black text-[#FF6B35]">${todayTotal.toFixed(2)}</p>
            </div>
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">This Week</p>
              <p className="text-2xl font-black text-[#FF6B35]">${weekTotal.toFixed(2)}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Total Deliveries</p>
              <p className="font-black text-white text-xl">{profile?.total_deliveries ?? deliveries.length}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Avg Rating</p>
              <p className="font-black text-yellow-400 text-xl">
                ⭐ {profile?.avg_rating?.toFixed(1) ?? '—'}
              </p>
            </div>
          </div>

          {/* History */}
          {deliveries.length > 0 ? (
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">History</h2>
              <div className="bg-slate-800 rounded-2xl divide-y divide-slate-700/50 border border-slate-700/50">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">#{d.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(d.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <p className="font-bold text-[#FF6B35]">+${d.delivery_fee.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <TrendingUp size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-400">Complete deliveries to see earnings</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
