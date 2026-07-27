import type { Metadata, Viewport } from 'next'
import { Anybody, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'
import { SplashScreen } from '@/components/splash-screen'

// Neighborly Modern type system. Exposed as CSS variables and consumed by the
// --font-* theme tokens in globals.css.
const anybody = Anybody({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-anybody',
  display: 'swap',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
})
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
})

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
  themeColor: '#fff8f6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anybody.variable} ${jakarta.variable} ${jetbrains.variable}`}>
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
