import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function AdminLayout() {
  const { loading, session, isAdmin, signOut } = useAuth()

  if (loading) return <p className="state" role="status">Carregando…</p>
  if (!session) return <Navigate to="/admin/login" replace />
  if (!isAdmin) {
    return (
      <div className="login-wrap">
        <div className="login-card" role="alert">
          <h1>Acesso não autorizado</h1>
          <p>Esta conta não tem permissão para acessar o painel da JAQUE PRATAS.</p>
          <button className="btn btn-primary" onClick={signOut}>Sair</button>
        </div>
      </div>
    )
  }

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined)
  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-bar-in">
          <span className="logo small">JAQUE PRATAS <em>painel</em></span>
          <nav aria-label="Painel">
            <NavLink to="/admin" end className={link}>Início</NavLink>
            <NavLink to="/admin/produtos" className={link}>Produtos</NavLink>
            <NavLink to="/admin/estoque" className={link}>Estoque</NavLink>
<NavLink to="/admin/clientes" className={link}>Clientes</NavLink>
<NavLink to="/admin/vendas" className={link}>Vendas</NavLink>
<NavLink to="/admin/recebimentos" className={link}>Recebimentos</NavLink>
<NavLink to="/admin/relatorios" className={link}>Relatórios</NavLink>
            <NavLink to="/admin/condicionais" className={link}>Condicionais</NavLink>
          </nav>
          <div className="admin-actions">
            <NavLink to="/" className="link">Ver loja</NavLink>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sair</button>
          </div>
        </div>
      </header>
      <main className="admin-main"><Outlet /></main>
    </div>
  )
}
