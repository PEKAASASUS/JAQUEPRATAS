import { Navigate, Route, Routes } from 'react-router-dom'
import CatalogPage from './pages/CatalogPage'
import AdminLayout from './admin/AdminLayout'
import LoginPage from './admin/LoginPage'
import DashboardPage from './admin/DashboardPage'
import ProductsPage from './admin/ProductsPage'
import ManagementPage from './admin/ManagementPage'
import { isConfigured } from './lib/supabase'

export default function App() {
  if (!isConfigured) {
    return (
      <div className="setup-warning" role="alert">
        <h1>Configuração pendente</h1>
        <p>
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo{' '}
          <code>.env.local</code> (veja o <code>.env.example</code> e o README) e reinicie o servidor.
        </p>
      </div>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="pedidos" element={<Navigate to="/admin/vendas" replace />} />
        <Route path="clientes" element={<ManagementPage mode="customers" />} />
<Route path="estoque" element={<ManagementPage mode="stock" />} />
<Route path="condicionais" element={<ManagementPage mode="conditionals" />} />
<Route path="vendas" element={<ManagementPage mode="sales" />} />
<Route path="recebimentos" element={<ManagementPage mode="payments" />} />
<Route path="relatorios" element={<ManagementPage mode="reports" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
