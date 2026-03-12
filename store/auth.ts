import { create } from 'zustand'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@/types'

interface AuthState {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  setUser: (user: SupabaseUser | null) => void
  setProfile: (profile: User | null) => void
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ user: null, profile: null, session: null }),
}))
