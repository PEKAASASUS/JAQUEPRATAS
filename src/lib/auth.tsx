import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  loading: boolean
  session: Session | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

async function checkAdmin(session: Session | null): Promise<boolean> {
  if (!session) return false
  // RLS só devolve a linha se for o próprio usuário e ele estiver em admin_users.
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
  return !error && Boolean(data)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let alive = true
    const apply = async (s: Session | null) => {
      const admin = await checkAdmin(s)
      if (!alive) return
      setSession(s)
      setIsAdmin(admin)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session)).catch(() => alive && setLoading(false))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      // adia para fora do callback para evitar deadlock do cliente Supabase
      setTimeout(() => apply(s), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? 'E-mail ou senha incorretos.' : null
  }
  const signOut = async () => { await supabase.auth.signOut() }

  return <Ctx.Provider value={{ loading, session, isAdmin, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
