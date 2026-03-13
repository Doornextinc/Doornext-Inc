'use client'

import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'

interface SavedCard {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
}

export default function PaymentPage() {
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/payment-methods')
      .then((r) => r.json())
      .then((data) => setCards(data.paymentMethods ?? []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Payment Methods" />

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl">
            <CreditCard size={40} className="text-gray-200 mb-3" />
            <h3 className="font-bold text-gray-700">No payment methods saved</h3>
            <p className="text-sm text-gray-400 mt-1 px-8">
              Payment methods are saved securely when you place your first order
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div key={card.id} className="bg-white rounded-2xl px-4 py-4 flex items-center gap-3">
                <div className="w-12 h-8 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">
                    {BRAND_LABEL[card.brand] ?? 'Card'}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {BRAND_LABEL[card.brand] ?? 'Card'} ···· {card.last4}
                  </p>
                  <p className="text-xs text-gray-400">
                    Expires {card.exp_month}/{card.exp_year}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

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
