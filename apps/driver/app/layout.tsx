import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'
import { SplashScreen } from '@/components/splash-screen'

export const metadata: Metadata = {
  title: 'Nexter Driver',
  description: 'Accept and deliver orders',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nexter',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#080808',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body>
        <SupabaseAuthProvider>
          <SplashScreen />
          {children}
        </SupabaseAuthProvider>
      </body>
    </html>
  )
}
