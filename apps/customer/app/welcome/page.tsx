'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CustomerLogo } from '@/components/ui/logo'

const FEATURES = [
  { emoji: '🍳', title: 'Home-cooked meals', desc: 'Order from local home cooks in your neighborhood' },
  { emoji: '🚀', title: 'Fast delivery', desc: 'Your Nexter delivers fresh food right to your door' },
  { emoji: '⭐', title: 'Rated & reviewed', desc: 'Trusted makers with real community reviews' },
]

export default function WelcomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] px-6 pt-16 pb-12 flex flex-col items-center text-center overflow-hidden">
        {/* Background circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white/10" />

        <div className="relative z-10">
          <CustomerLogo size={80} className="rounded-3xl shadow-lg mb-5 mx-auto" />
          <h1 className="text-4xl font-black text-white leading-tight mb-3">
            Doornext
          </h1>
          <p className="text-white/85 text-base leading-relaxed max-w-xs">
            Discover amazing home-cooked food from talented makers in your neighborhood
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="flex-1 px-6 py-8">
        <div className="space-y-5">
          {FEATURES.map(({ emoji, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                {emoji}
              </div>
              <div>
                <p className="font-bold text-gray-900">{title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTAs */}
      <div className="px-6 pb-10 space-y-3">
        <Link
          href="/signup"
          className="w-full flex items-center justify-center gap-2 bg-[#FF6B35] text-white font-bold text-base rounded-2xl py-4 active:bg-[#E55A24] transition-colors"
        >
          Get Started
          <ChevronRight size={18} />
        </Link>
        <Link
          href="/login"
          className="w-full flex items-center justify-center bg-white text-[#FF6B35] font-bold text-base rounded-2xl py-4 border-2 border-[#FF6B35] active:bg-orange-50 transition-colors"
        >
          Sign In
        </Link>
        <p className="text-center text-xs text-gray-400 pt-1">
          By continuing, you agree to our Terms & Privacy Policy
        </p>
      </div>
    </div>
  )
}
