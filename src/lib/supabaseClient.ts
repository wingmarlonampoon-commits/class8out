import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the environment.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A second, throwaway client for creating OTHER people's auth accounts (e.g.
// an admin adding a teacher) from an already-authenticated session. The main
// `supabase` client above is shared app-wide and AuthProvider listens to its
// onAuthStateChange — calling auth.signUp() on it would swap the browser's
// session to the newly created account and reactively redirect the current
// user. This client never persists a session or touches that listener, so
// the signed-in admin's session is completely unaffected.
export function createIsolatedAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
