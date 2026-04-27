import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'

export const metadata: Metadata = {
  metadataBase: new URL('https://doornext.app'),
  title: {
    default: 'Doornext — Home-Cooked Food Delivery',
    template: '%s | Doornext',
  },
  description: 'Order authentic home-cooked meals from local food makers in your neighborhood.',
  keywords: ['home cooked food', 'food delivery', 'local makers', 'authentic meals'],
  manifest: '/manifest.json',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'Doornext',
    title: 'Doornext — Home-Cooked Food Delivery',
    description: 'Order authentic home-cooked meals from local food makers in your neighborhood.',
    url: 'https://doornext.app',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Doornext' }],
  },
  twitter: {
    card: 'summary',
    title: 'Doornext — Home-Cooked Food Delivery',
    description: 'Order authentic home-cooked meals from local food makers in your neighborhood.',
    images: ['/icons/icon-512.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Doornext',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#FF6B35',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased bg-white">
        <SupabaseAuthProvider>
          <div className="relative max-w-[430px] mx-auto min-h-screen bg-white shadow-xl">
            {children}
          </div>
        </SupabaseAuthProvider>
      </body>
    </html>
  )
}
