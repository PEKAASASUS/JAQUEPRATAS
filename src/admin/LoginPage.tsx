import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const { loading, session, isAdmin, signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session && isAdmin) return <Navigate to="/admin" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
    else nav('/admin', { replace: true })
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Painel JackPratas</h1>
        <p>Acesso exclusivo da proprietária.</p>
        <label className="field">E-mail
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field">Senha
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
