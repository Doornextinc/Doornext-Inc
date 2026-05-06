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

interface AuthInfo {
  email_confirmed: boolean
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

interface MakerProfile {
  id: string
  display_name: string
  bio: string | null
  cuisine_tags: string[]
  avg_rating: number
  total_reviews: number
  is_open: boolean
  approval_status: string
  kyc_status: string
  rejection_reason: string | null
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

interface Order {
  id: string
  status: string
  total: number
  created_at: string
  food_makers: { display_name: string } | null
}

interface RoleData {
  orders?: Order[]
  totalSpent?: number
  orderCount?: number
  maker?: MakerProfile
  menuCount?: number
  revenue30d?: number
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
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null)
  const [roleData, setRoleData] = useState<RoleData>({})
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/users/${id}`)
    if (res.ok) {
      const data = await res.json()
      setUser(data.user)
      setAuthInfo(data.authInfo ?? null)
      setRoleData(data.roleData ?? {})
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const post = async (path: string, body?: Record<string, unknown>) => {
    setActing(true)
    const res = await fetch(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    setActing(false)
    return { ok: res.ok, data }
  }

  const changeStatus = async (action: 'approve' | 'suspend' | 'ban') => {
    if (!confirm(`${action} this user?`)) return
    const { ok } = await post(`/api/admin/users/${id}/${action}`)
    if (ok) { showToast(`User ${action}d`); await load() }
    else showToast('Action failed', 'err')
  }

  const changeRole = async (newRole: string) => {
    if (!confirm(`Change role to "${newRole}"?`)) return
    setActing(true)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, role: newRole }),
    })
    setActing(false)
    if (res.ok) { showToast('Role updated'); await load() }
    else showToast('Failed to update role', 'err')
  }

  const confirmEmail = async () => {
    const { ok } = await post(`/api/admin/users/${id}/confirm-email`)
    if (ok) { showToast('Email confirmed — user can now sign in'); await load() }
    else showToast('Failed to confirm email', 'err')
  }

  const sendReset = async () => {
    const { ok, data } = await post(`/api/admin/users/${id}/send-reset-email`)
    if (ok) {
      showToast(`Reset link generated for ${data.email}`)
      if (data.reset_link) setResetLink(data.reset_link)
    } else {
      showToast(data.error ?? 'Failed', 'err')
    }
  }

  const approveMaker = async (action: 'approve' | 'reject') => {
    const reason = action === 'reject' ? prompt('Rejection reason (shown to seller):') : null
    if (action === 'reject' && reason === null) return // cancelled
    const { ok } = await post(`/api/admin/users/${id}/approve-maker`, { action, rejection_reason: reason })
    if (ok) { showToast(`Seller ${action}d`); await load() }
    else showToast('Action failed', 'err')
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-40 bg-gray-100 rounded-lg animate-pulse mb-6" />
        <div className="space-y-4">
          {[1,2,3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <p className="text-gray-400 text-sm mt-8 text-center">User not found.</p>
      </div>
    )
  }

  const maker = roleData.maker

  return (
    <div className="p-8 max-w-5xl relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white transition-all ${
          toast.type === 'ok' ? 'bg-gray-900' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">← Users</button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-900">{user.full_name}</span>
      </div>

      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-2xl font-black text-gray-900">{user.full_name}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {user.role}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[user.account_status ?? 'approved']}`}>
                {user.account_status ?? 'approved'}
              </span>
              {authInfo && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  authInfo.email_confirmed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                  {authInfo.email_confirmed ? '✉️ Email confirmed' : '✉️ Email not confirmed'}
                </span>
              )}
            </div>
            <div className="space-y-0.5 text-sm text-gray-500">
              {user.email && <p>✉️ {user.email}</p>}
              {user.phone && <p>📞 {user.phone}</p>}
              <p className="text-xs text-gray-400">
                Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              {authInfo?.last_sign_in_at && (
                <p className="text-xs text-gray-400">
                  Last sign in {new Date(authInfo.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 items-end shrink-0">
            {/* Role */}
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
            {/* Account status */}
            <div className="flex gap-2 flex-wrap justify-end">
              {user.account_status !== 'approved' && (
                <button onClick={() => changeStatus('approve')} disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-green-600 border border-green-200 hover:bg-green-50 disabled:opacity-50">
                  Approve
                </button>
              )}
              {!['suspended', 'banned'].includes(user.account_status) && (
                <button onClick={() => changeStatus('suspend')} disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-orange-600 border border-orange-200 hover:bg-orange-50 disabled:opacity-50">
                  Suspend
                </button>
              )}
              {user.account_status !== 'banned' && (
                <button onClick={() => changeStatus('ban')} disabled={acting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 disabled:opacity-50">
                  Ban
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Auth actions ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Authentication</h2>
        <div className="flex gap-3 flex-wrap">
          {authInfo && !authInfo.email_confirmed && (
            <button
              onClick={confirmEmail}
              disabled={acting}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              ✉️ Confirm Email
            </button>
          )}
          {authInfo && authInfo.email_confirmed && (
            <span className="text-sm text-green-600 font-semibold flex items-center gap-1.5 px-4 py-2 bg-green-50 rounded-xl border border-green-100">
              ✓ Email confirmed
            </span>
          )}
          <button
            onClick={sendReset}
            disabled={acting}
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            🔑 Send Password Reset
          </button>
        </div>

        {resetLink && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Password reset link (valid 1 hour) — copy and send to user:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resetLink}
                className="flex-1 text-xs font-mono bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(resetLink); showToast('Copied!') }}
                className="text-xs font-semibold px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 shrink-0"
              >
                Copy
              </button>
              <button onClick={() => setResetLink(null)} className="text-gray-400 hover:text-gray-600 px-1">✕</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Maker approval ─────────────────────────────────────────────────── */}
      {user.role === 'maker' && maker && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Seller Account</h2>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="font-semibold text-gray-900">{maker.display_name}</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              maker.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
              maker.approval_status === 'rejected' ? 'bg-red-100 text-red-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {maker.approval_status}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${KYC_COLORS[maker.kyc_status ?? 'not_submitted']}`}>
              KYC: {(maker.kyc_status ?? 'not_submitted').replace(/_/g, ' ')}
            </span>
          </div>
          {maker.rejection_reason && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
              Rejection reason: {maker.rejection_reason}
            </p>
          )}
          <div className="flex gap-3">
            {maker.approval_status !== 'approved' && (
              <button onClick={() => approveMaker('approve')} disabled={acting}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                ✓ Approve Seller
              </button>
            )}
            {maker.approval_status === 'approved' && (
              <button onClick={() => approveMaker('reject')} disabled={acting}
                className="text-sm font-semibold px-4 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">
                Revoke Approval
              </button>
            )}
            {maker.approval_status === 'pending' && (
              <button onClick={() => approveMaker('reject')} disabled={acting}
                className="text-sm font-semibold px-4 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">
                Reject
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Role-specific stats ────────────────────────────────────────────── */}
      {user.role === 'customer' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Orders Delivered</p>
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
                        <Link href={`/operations/orders/${order.id}`} className="font-mono text-xs font-bold text-[#FF6B35] hover:underline">
                          #{order.id.slice(-8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{order.food_makers?.display_name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold">${(order.total ?? 0).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {user.role === 'maker' && maker && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Rating</p>
            <p className="text-3xl font-black text-gray-900">
              {maker.avg_rating > 0 ? `⭐ ${maker.avg_rating.toFixed(1)}` : '—'}
            </p>
            <p className="text-xs text-gray-400">{maker.total_reviews} reviews</p>
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
      )}

      {user.role === 'driver' && roleData.profile && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Deliveries</p>
              <p className="text-3xl font-black text-gray-900">{roleData.profile.total_deliveries}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Rating</p>
              <p className="text-3xl font-black text-gray-900">
                {roleData.profile.avg_rating > 0 ? `⭐ ${roleData.profile.avg_rating.toFixed(1)}` : '—'}
              </p>
            </div>
            <div className="bg-[#FF6B35] rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-100 mb-1">Earnings (30d)</p>
              <p className="text-3xl font-black text-white">${(roleData.earnings30d ?? 0).toFixed(2)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-3">Driver Profile</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Vehicle</p>
                <p className="font-medium text-gray-900 capitalize">{roleData.profile.vehicle_type ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">KYC Status</p>
                <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${KYC_COLORS[roleData.profile.kyc_status ?? 'not_submitted']}`}>
                  {(roleData.profile.kyc_status ?? 'not_submitted').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
