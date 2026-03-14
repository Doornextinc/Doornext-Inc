import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://rheymiouqkewbddqvxqp.supabase.co'

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZXltaW91cWtld2JkZHF2eHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTI1NDAsImV4cCI6MjA4ODkyODU0MH0.Y7i8OOIUy_idjTzP6QOql1nI4WOEmB7XVxA348lPQuQ'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
