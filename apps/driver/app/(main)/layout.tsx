'use client'

import { usePathname } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'

/**
 * The home page (`/`) uses a Dasher-style full-screen map with floating
 * controls + side drawer for navigation — no bottom nav, no bottom sheet.
 * Every other (main) route keeps the conventional bottom nav.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHome = pathname === '/'

  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto relative bg-[#080808]">
      <main className={isHome ? 'flex-1' : 'flex-1 pb-nav'}>{children}</main>
      {!isHome && <BottomNav />}
    </div>
  )
}
