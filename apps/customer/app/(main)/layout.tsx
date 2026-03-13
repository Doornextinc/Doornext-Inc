import { BottomNav } from '@/components/layout/bottom-nav'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-nav">{children}</main>
      <BottomNav />
    </div>
  )
}
