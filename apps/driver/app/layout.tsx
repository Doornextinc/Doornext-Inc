import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'

export const metadata: Metadata = {
  title: 'Nexter Driver',
  description: 'Accept and deliver orders',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#080808',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SupabaseAuthProvider>{children}</SupabaseAuthProvider></body>
    </html>
  )
}
