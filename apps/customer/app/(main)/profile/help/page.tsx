'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { BRAND } from '@doornext/shared/brand'

const FAQS = [
  {
    q: 'How do I track my order?',
    a: 'Go to the Orders tab to see live status updates for all your orders. You can also message your maker directly via the chat feature.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'You can cancel an order within 2 minutes of placing it. After that, please contact the maker directly via chat.',
  },
  {
    q: 'What if my food arrives cold or wrong?',
    a: 'Tap "Help" on the order detail screen to report an issue. We\'ll make it right.',
  },
  {
    q: 'How do payments work?',
    a: 'We charge your card when the maker accepts your order. Refunds are processed within 5–10 business days.',
  },
  {
    q: 'How do I become a food maker?',
    a: 'Download the Doornext Maker app and apply to join. We\'re always looking for talented home cooks!',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      className="w-full text-left bg-white rounded-2xl px-4 py-4"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-800 text-sm pr-4">{q}</p>
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && <p className="text-sm text-gray-500 mt-3 leading-relaxed">{a}</p>}
    </button>
  )
}

export default function HelpPage() {
  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Help & Support" />

      <div className="p-4 space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-2">
          Frequently Asked Questions
        </p>
        {FAQS.map((faq) => (
          <FAQItem key={faq.q} q={faq.q} a={faq.a} />
        ))}

        <div className="bg-white rounded-2xl px-4 py-4 mt-4">
          <p className="text-sm font-bold text-gray-800 mb-1">Didn&apos;t find what you need?</p>
          <p className="text-xs text-gray-500 mb-2">
            Message the Maker directly — they&apos;re your neighbor and want to make it right. Still need us?
          </p>
          <p className="text-xs text-gray-400">
            <a href={`mailto:${BRAND.support.email}`} className="text-[#FF6B35] font-semibold">
              {BRAND.support.email}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
