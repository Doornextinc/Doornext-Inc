'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface User {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  account_status: string
  created_at: string
}

interface Order {
  id: string
  status: string
  total: number
  created_at: string
  food_makers: { display_name: string } | null
}

interface MakerProfile {
  id: string
  display_name: string
  bio: string | null
  cuisine_tags: string[]
  avg_rating: number
  total_reviews: number
  is_open: boolean
}

interface DriverProfile {
  id: string
  full_name: string
  vehicle_type: string | null
  kyc_status: string | null
  is_active: boolean
  total_deliveries: number
  avg_rating: number
}

interface RoleData {
  // customer
  orders?: Order[]
  totalSpent?: number
  orderCount?: number
  // maker
  maker?: MakerProfile
  menuCount?: number
  revenue30d?: number
  // driver
  profile?: DriverProfile
  earnings30d?: number
  kycDoc?: { submitted_at: string; reviewed_at: string | null; review_notes: string | null } | null
}

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-gray-100 text-gray-600',
  maker: 'bg-orange-100 text-orange-700',
  driver: 'bg-blue-100 text-blue-700',
  admin: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-orange-100 text-orange-700',
  banned: 'bg-red-100 text-red-700',
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-purple-100 text-purple-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  on_the_way: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const KYC_COLORS: Record<string, string> = {
  not_submitted: 'bg-gray-100 text-gray-500',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const ALL_ROLES = ['customer', 'maker', 'driver', 'admin']

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [roleData, setRoleData] = useState<RoleData>({})
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/users/${id}`)
    if (res.ok) {
      const data = await res.json()
      setUser(data.user)
      setRoleData(data.roleData ?? {})
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const changeStatus = async (action: 'approve' | 'suspend' | 'ban') => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) return
    setActing(true)
    await fetch(`/api/admin/users/${id}/${action}`, { method: 'POST' })
    await load()
    setActing(false)
  }

  const changeRole = async (newRole: string) => {
    if (!confirm(`Change this user's role to "${newRole}"?`)) return
    setActing(true)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, role: newRole }),
    })
    await load()
    setActing(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-40 bg-gray-100 rounded-lg animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-8">
        <Link href="/users" className="text-sm text-gray-400 hover:text-gray-600">← Users</Link>
        <p className="text-gray-400 text-sm mt-8 text-center">User not found.</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">← Users</button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-900">{user.full_name}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-black text-gray-900">{user.full_name}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {user.role}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[user.account_status ?? 'approved']}`}>
                {user.account_status ?? 'approved'}
              </span>
            </div>
            <div className="space-y-1 text-sm text-gray-500">
              {user.email && <p>✉️ {user.email}</p>}
              {user.phone && <p>📞 {user.phone}</p>}
              <p className="text-xs text-gray-400">
                Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-end shrink-0">
            {/* Role change */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Role:</span>
              <select
                value={user.role}
                disabled={acting}
                onChange={(e) => changeRole(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-gray-400 disabled:opacity-50 cursor-pointer"
              >
                {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {/* Status actions */}
            <div className="flex gap-2">
              {user.account_status !== 'approved' && (
                <button
                  onClick={() => changeStatus('approve')}
                  disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-green-600 border border-green-200 hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
              )}
              {user.account_status !== 'suspended' && user.account_status !== 'banned' && (
                <button
                  onClick={() => changeStatus('suspend')}
                  disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-orange-600 border border-orange-200 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                >
                  Suspend
                </button>
              )}
              {user.account_status !== 'banned' && (
                <button
                  onClick={() => changeStatus('ban')}
                  disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Ban
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role-specific section */}
      {user.role === 'customer' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Total Orders Delivered</p>
              <p className="text-3xl font-black text-gray-900">{roleData.orderCount ?? 0}</p>
            </div>
            <div className="bg-[#FF6B35] rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-100 mb-1">Total Spent</p>
              <p className="text-3xl font-black text-white">${(roleData.totalSpent ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {(roleData.orders ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">Recent Orders</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Order</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Kitchen</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Total</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(roleData.orders ?? []).map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/operations/orders/${order.id}`}
                          className="font-mono text-xs font-bold text-[#FF6B35] hover:underline"
                        >
                          #{order.id.slice(-8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{order.food_makers?.display_name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ORDER_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">${(order.total ?? 0).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {user.role === 'maker' && roleData.maker && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Avg Rating</p>
              <p className="text-3xl font-black text-gray-900">
                {roleData.maker.avg_rating > 0 ? `⭐ ${roleData.maker.avg_rating.toFixed(1)}` : '—'}
              </p>
              <p className="text-xs text-gray-400">{roleData.maker.total_reviews} reviews</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Menu Items</p>
              <p className="text-3xl font-black text-gray-900">{roleData.menuCount ?? 0}</p>
            </div>
            <div className="bg-[#FF6B35] rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-100 mb-1">Revenue (30d)</p>
              <p className="text-3xl font-black text-white">${(roleData.revenue30d ?? 0).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-bold text-gray-900">{roleData.maker.display_name}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleData.maker.is_open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {roleData.maker.is_open ? 'Open' : 'Closed'}
              </span>
            </div>
            {roleData.maker.bio && (
              <p className="text-sm text-gray-600 mb-3">{roleData.maker.bio}</p>
            )}
            {roleData.maker.cuisine_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {roleData.maker.cuisine_tags.map((tag) => (
                  <span key={tag} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {user.role === 'driver' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Total Deliveries</p>
              <p className="text-3xl font-black text-gray-900">{roleData.profile?.total_deliveries ?? 0}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Rating</p>
              <p className="text-3xl font-black text-gray-900">
                {(roleData.profile?.avg_rating ?? 0) > 0
                  ? `⭐ ${roleData.profile!.avg_rating.toFixed(1)}`
                  : '—'}
              </p>
            </div>
            <div className="bg-[#FF6B35] rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-100 mb-1">Earnings (30d)</p>
              <p className="text-3xl font-black text-white">${(roleData.earnings30d ?? 0).toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Status</p>
              <span className={`inline-flex items-center mt-1 px-2.5 py-1 rounded-full text-xs font-bold ${roleData.profile?.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {roleData.profile?.is_active ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4">Driver Profile</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Vehicle Type</p>
                <p className="font-medium text-gray-900 capitalize">{roleData.profile?.vehicle_type ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">KYC Status</p>
                <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${KYC_COLORS[roleData.profile?.kyc_status ?? 'not_submitted']}`}>
                  {(roleData.profile?.kyc_status ?? 'not_submitted').replace(/_/g, ' ')}
                </span>
              </div>
              {roleData.kycDoc && (
                <>
                  <div>
                    <p className="text-xs text-gray-400">KYC Submitted</p>
                    <p className="font-medium text-gray-900">
                      {new Date(roleData.kycDoc.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {roleData.kycDoc.reviewed_at && (
                    <div>
                      <p className="text-xs text-gray-400">KYC Reviewed</p>
                      <p className="font-medium text-gray-900">
                        {new Date(roleData.kycDoc.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {roleData.kycDoc.review_notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Review Notes</p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mt-1">{roleData.kycDoc.review_notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            {roleData.profile?.kyc_status === 'pending_review' && (
              <div className="mt-4">
                <Link
                  href="/operations/kyc"
                  className="text-xs font-semibold text-[#FF6B35] hover:underline"
                >
                  Review KYC documents →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
