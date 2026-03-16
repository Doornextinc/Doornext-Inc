import type { Metadata } from 'next'
import './globals.css'
import { SupabaseAuthProvider } from '@/components/providers/supabase-auth-provider'

export const metadata: Metadata = {
  title: 'Nexter Admin',
  description: 'Operator dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SupabaseAuthProvider>{children}</SupabaseAuthProvider></body>
    </html>
  )
}
