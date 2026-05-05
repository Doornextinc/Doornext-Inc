// Middleware handles / → /dashboard or /login before this component ever runs.
// This redirect is a belt-and-suspenders fallback only.
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/dashboard')
}
