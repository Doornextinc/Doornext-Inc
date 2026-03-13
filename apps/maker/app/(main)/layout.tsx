import { BottomNav } from '@/components/layout/bottom-nav'
import { ToastContainer } from '@/components/ui/toast'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto relative">
      <ToastContainer />
      <main className="flex-1 pb-nav">{children}</main>
      <BottomNav />
    </div>
  )
}
