import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Role } from '../data/roleAccess'

export type AuthState = {
  session: Session | null
  role: Role | null
  loading: boolean
}

export const AuthContext = createContext<AuthState>({ session: null, role: null, loading: true })
