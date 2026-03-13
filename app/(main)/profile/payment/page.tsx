'use client'

import { CreditCard } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'

export default function PaymentPage() {
  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Payment Methods" />

      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl">
          <CreditCard size={40} className="text-gray-200 mb-3" />
          <h3 className="font-bold text-gray-700">No payment methods saved</h3>
          <p className="text-sm text-gray-400 mt-1 px-8">
            Payment methods are saved securely when you place your first order
          </p>
        </div>

        <div className="bg-white rounded-2xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <span className="text-lg">🔒</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Secured by Stripe</p>
              <p className="text-xs text-gray-400">Your card details are never stored on our servers</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
