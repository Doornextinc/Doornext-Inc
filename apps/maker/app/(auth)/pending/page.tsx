'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PendingApprovalPage() {
  const router = useRouter()
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [kycStatus, setKycStatus] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers')
        .select('approval_status, rejection_reason, kyc_status')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!maker) return

      // If KYC not submitted yet, send back to onboarding
      if (!maker.kyc_status || maker.kyc_status === 'not_submitted') {
        router.push('/onboarding')
        return
      }

      setStatus(maker.approval_status as 'pending' | 'approved' | 'rejected')
      setKycStatus(maker.kyc_status)
      setRejectionReason(maker.rejection_reason ?? null)

      if (maker.approval_status === 'approved') {
        router.push('/dashboard')
      }
    }

    check()

    // Poll every 30s so the maker lands on dashboard automatically when approved
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [router])

  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 rounded-3xl bg-red-100 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">😔</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Application not approved</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-4">
            Unfortunately we weren&apos;t able to approve your Doornext Maker application at this time.
          </p>
          {rejectionReason && (
            <div className="bg-white border border-red-100 rounded-2xl p-4 mb-6 text-left">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Reason</p>
              <p className="text-sm text-gray-700">{rejectionReason}</p>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Questions? Contact us at{' '}
            <a href="mailto:support@doornext.com" className="text-[#FF6B35] font-semibold hover:underline">
              support@doornext.com
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#FF6B35]/25">
          <span className="text-4xl">⏳</span>
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Application under review</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Your Doornext Maker application is being reviewed by our team. You&apos;ll receive an email
          once it&apos;s approved — usually within 24 hours.
        </p>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 text-left shadow-sm mb-8">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Your progress</p>
          <div className="space-y-3">
            {[
              { icon: '✅', text: 'Email verified', done: true },
              { icon: kycStatus === 'pending_review' || kycStatus === 'approved' ? '✅' : '📋', text: 'Business info submitted', done: kycStatus === 'pending_review' || kycStatus === 'approved' },
              { icon: '🔍', text: 'Team reviews your application', done: false },
              { icon: '📩', text: 'Approval email sent', done: false },
              { icon: '🚀', text: 'Start selling on Doornext', done: false },
            ].map(({ icon, text, done }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-lg w-7 text-center">{icon}</span>
                <p className={`text-sm ${done ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
          <p className="text-xs text-gray-400">This page checks for updates automatically</p>
        </div>
      </div>
    </div>
  )
}
