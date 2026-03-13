'use client'

import Link from 'next/link'
import { ChefHat, TrendingUp, Clock, ShieldCheck, ChevronRight } from 'lucide-react'

const BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Keep More Revenue',
    desc: 'Low platform fees mean you take home more from every order.',
  },
  {
    icon: Clock,
    title: 'Your Hours, Your Rules',
    desc: 'Open and close your kitchen whenever you want. No minimum hours.',
  },
  {
    icon: ChefHat,
    title: 'Cook What You Love',
    desc: 'No menus to follow. Sell your specialties to a hungry local audience.',
  },
  {
    icon: ShieldCheck,
    title: 'We Handle Delivery',
    desc: 'Doornext drivers pick up and deliver. You just cook and get paid.',
  },
]

export default function MakerWelcomePage() {
  return (
    <div className="min-h-screen bg-[#F5F4F2] flex flex-col lg:flex-row">
      {/* Left panel — hero */}
      <div className="lg:flex-1 flex flex-col justify-center px-8 py-16 lg:px-16 bg-white border-b lg:border-b-0 lg:border-r border-[#EBEBEB]">
        <div className="max-w-lg mx-auto lg:mx-0">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-[#111] flex items-center justify-center">
              <span className="text-white font-black text-lg">D</span>
            </div>
            <span className="text-[#111] font-black text-xl tracking-tight">Doornext</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-[#111] leading-tight mb-4">
            Turn your kitchen<br />
            into a business.
          </h1>
          <p className="text-[#666] text-lg mb-10 leading-relaxed">
            Sell your homemade food to customers in your area. Set your own prices, your own hours, your own menu.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 bg-[#111] hover:bg-[#333] text-white font-bold py-4 px-8 rounded-2xl transition-colors text-base"
            >
              Apply to Sell
              <ChevronRight size={18} />
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center bg-white hover:bg-[#F5F4F2] border border-[#EBEBEB] text-[#111] font-semibold py-4 px-8 rounded-2xl transition-colors text-base"
            >
              Sign In
            </Link>
          </div>

          <p className="text-xs text-[#BBB] mt-6">
            Join hundreds of home chefs already earning on Doornext.
          </p>
        </div>
      </div>

      {/* Right panel — benefits */}
      <div className="lg:w-[480px] flex flex-col justify-center px-8 py-12 lg:px-12 bg-[#F5F4F2]">
        <h2 className="text-[11px] font-black text-[#AAA] uppercase tracking-widest mb-8">Why makers love us</h2>
        <div className="space-y-6">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4">
              <div className="w-11 h-11 rounded-xl bg-white border border-[#EBEBEB] flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-[#555]" />
              </div>
              <div>
                <p className="font-bold text-[#111] mb-1">{title}</p>
                <p className="text-sm text-[#666] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 p-4 bg-white rounded-2xl border border-[#EBEBEB]">
          <p className="text-sm text-[#111] font-semibold mb-1">Already a maker?</p>
          <p className="text-xs text-[#666]">
            <Link href="/login" className="text-[#111] font-bold underline">Sign in here</Link> to manage your kitchen dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
