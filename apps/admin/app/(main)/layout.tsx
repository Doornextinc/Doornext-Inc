import { Sidebar } from '@/components/sidebar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  )
}
