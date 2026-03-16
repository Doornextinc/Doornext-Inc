import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'

export const metadata: Metadata = {
  title: 'Doornext Maker',
  description: 'Manage your orders and menu',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FF6B35',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SupabaseAuthProvider>{children}</SupabaseAuthProvider></body>
    </html>
  )
}
