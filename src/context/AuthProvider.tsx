import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Role } from '../data/roleAccess'
import { AuthContext, type AuthState } from './AuthContext'

function roleFromSession(session: Session | null): Role | null {
  const role = session?.user.user_metadata?.role
  return typeof role === 'number' ? (role as Role) : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, role: roleFromSession(data.session), loading: false })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, role: roleFromSession(session), loading: false })
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
