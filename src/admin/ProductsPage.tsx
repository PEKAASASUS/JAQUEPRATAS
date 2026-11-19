import { useCallback, useEffect, useState } from 'react'
import Dialog from '../components/Dialog'
import ProductImage from '../components/ProductImage'
import ProductForm from './ProductForm'
import ProductStockDialog from './ProductStockDialog'
import RecordActionDialog, { type RecordActionTarget } from './RecordActionDialog'
import { listProducts, setActive } from '../lib/adminProducts'
import { fetchCategories } from '../lib/catalog'
import { formatBRL, toCents } from '../lib/money'
import type { AdminProduct, Category } from '../lib/types'

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [stockProduct, setStockProduct] = useState<AdminProduct | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [recordAction, setRecordAction] = useState<RecordActionTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listProducts(), fetchCategories()])
      setProducts(p); setCategories(c); setStatus('ok')
    } catch { setStatus('error') }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); setNotice(ok); await load() } catch (e) { setNotice((e as Error).message) }
  }

  const rows = products.filter(p => showArchived ? p.archived_at !== null : p.archived_at === null)
  const current = editing && editing !== 'new' ? products.find(p => p.id === editing) ?? null : null

  return (
    <section>
      <div className="admin-head">
        <h1 className="admin-h1">Produtos</h1>
        <button className="btn btn-primary" onClick={() => { setNotice(null); setEditing('new') }}>Cadastrar produto</button>
      </div>
      <div className="admin-filters">
        <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Mostrar arquivados</label>
      </div>
      {notice && <p className="notice-box" role="status">{notice}</p>}

      {status === 'loading' && <p className="state" role="status">Carregando produtos…</p>}
      {status === 'error' && <div className="state" role="alert"><p>Não foi possível carregar os produtos.</p>
        <button className="btn btn-ghost" onClick={load}>Tentar de novo</button></div>}
      {status === 'ok' && rows.length === 0 && (
        <p className="state">{showArchived ? 'Nenhum produto arquivado.' : 'Nenhum produto cadastrado ainda. Clique em “Cadastrar produto”.'}</p>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Foto</th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td className="thumb"><ProductImage path={p.product_images[0]?.storage_path} alt="" /></td>
                  <td><b>{p.name}</b>{p.sku && <small> · {p.sku}</small>}</td>
                  <td>{p.categories?.name}</td>
                  <td>
                    {p.promo_price !== null
                      ? <><s>{formatBRL(toCents(p.price))}</s> <b>{formatBRL(toCents(p.promo_price))}</b></>
                      : formatBRL(toCents(p.price))}
                  </td>
                  <td>{p.stock_quantity}</td>
                  <td>
                    {p.archived_at ? <span className="tag off">Arquivado</span>
                      : p.is_active ? (p.stock_quantity > 0 ? <span className="tag ok">Ativo</span> : <span className="tag warn">Ativo, sem estoque</span>)
                      : <span className="tag off">Inativo</span>}
                  </td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setNotice(null); setEditing(p.id) }}>Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStockProduct(p)}>Movimentações</button>
                    {!p.archived_at && (
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => run(() => setActive(p.id, !p.is_active), p.is_active ? 'Produto desativado.' : 'Produto ativado.')}>
                        {p.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setRecordAction({ kind: 'product', id: p.id, name: p.name, archived: Boolean(p.archived_at), intent: 'archive' })}>
                      {p.archived_at ? 'Reativar' : 'Arquivar'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRecordAction({ kind: 'product', id: p.id, name: p.name, archived: Boolean(p.archived_at), intent: 'delete' })}>Excluir peça</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stockProduct && <ProductStockDialog product={stockProduct} onClose={() => setStockProduct(null)} onChanged={load} />}
      <RecordActionDialog target={recordAction} onClose={() => setRecordAction(null)} onDone={async message => { setRecordAction(null); setNotice(message); await load() }} />
      <Dialog open={editing !== null} onClose={() => setEditing(null)} label="Formulário de produto" className="modal">
        {editing !== null && (
          <ProductForm
            key={editing}
            product={current}
            categories={categories}
            onCancel={() => setEditing(null)}
            onImagesChanged={load}
            onSaved={msg => { setEditing(null); setNotice(msg); load() }}
          />
        )}
      </Dialog>
    </section>
  )
}
