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
          Preencha <code>VITE_SUPABASE_URL</code> com a URL http/https do projeto e <code>VITE_SUPABASE_ANON_KEY</code> com a chave pública real no arquivo{' '}
          <code>.env.local</code>, na mesma pasta do package.json, e reinicie o servidor. Substitua os textos de exemplo pelos dados do seu projeto Supabase de testes.
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
<Route path="estoque" element={<Navigate to="/admin/produtos" replace />} />
<Route path="condicionais" element={<Navigate to="/admin" replace />} />
<Route path="vendas" element={<ManagementPage mode="sales" />} />
<Route path="recebimentos" element={<Navigate to="/admin/vendas?aba=recebimentos" replace />} />
<Route path="relatorios" element={<ManagementPage mode="reports" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
