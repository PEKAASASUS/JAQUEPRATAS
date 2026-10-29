import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Dialog from '../components/Dialog'
import RecordActionDialog, { type RecordActionTarget } from './RecordActionDialog'
import { formatBRL, parseBRLInput, toCents, pixCents } from '../lib/money'
import { buildCSV, withinPeriod } from '../lib/management'
import { executeManagement, loadManagement, type Snapshot, type Customer, type Sale } from './services'

type Mode = 'dashboard' | 'customers' | 'stock' | 'conditionals' | 'sales' | 'payments' | 'reports'
const titles: Record<Mode, string> = { dashboard: 'Início', customers: 'Clientes', stock: 'Estoque', conditionals: 'Condicionais', sales: 'Vendas', payments: 'Recebimentos e contas a receber', reports: 'Relatórios' }
const money = (value: number) => formatBRL(toCents(value))
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—'
const names: Record<string, string> = { pix: 'Pix', card: 'Cartão', standard: 'Preço integral', cash: 'Dinheiro', bank_transfer: 'Transferência', return: 'Retorno', loss: 'Perda/dano', sale: 'Compra', reversal: 'Reversão', immediate: 'À vista', store_credit: 'Crédito da loja' }
const label = (value: string) => names[value] ?? value
function exportCSV(filename: string, rows: unknown[][]) {
 const url = URL.createObjectURL(new Blob([buildCSV(rows)], { type: 'text/csv;charset=utf-8' }))
 const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
interface CartLine { product_id: string; quantity: number }
interface Action { action: string; title: string; id: string; max?: number; amount?: number }

export default function ManagementPage({ mode }: { mode: Mode }) {
 const [data, setData] = useState<Snapshot | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [busy, setBusy] = useState(false)
 const sending = useRef(false)
 const pending = useRef<{ signature: string; key: string } | null>(null)
 const [query, setQuery] = useState('')
 const [customerFilter, setCustomerFilter] = useState('')
 const [productFilter, setProductFilter] = useState('')
 const [categoryFilter, setCategoryFilter] = useState('')
 const [methodFilter, setMethodFilter] = useState('')
 const [statusFilter, setStatusFilter] = useState('')
 const [start, setStart] = useState('')
 const [end, setEnd] = useState('')
 const [recordAction, setRecordAction] = useState<RecordActionTarget | null>(null)
 const [editing, setEditing] = useState<Customer | 'new' | null>(null)
 const [history, setHistory] = useState('')
 const [cartType, setCartType] = useState<'sale' | 'conditional' | null>(null)
 const [cart, setCart] = useState<CartLine[]>([])
 const [cartCustomer, setCartCustomer] = useState('')
 const [cartConditional, setCartConditional] = useState('')
 const [pricing, setPricing] = useState('card')
 const [terms, setTerms] = useState('immediate')
 const [paymentMethod, setPaymentMethod] = useState('card')
 const [action, setAction] = useState<Action | null>(null)
 const openAction = (value: Action) => { setNotice(''); setAction(value) }

 const load = useCallback(async () => {
  setLoading(true); setError('')
  try { setData(await loadManagement()) } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
 }, [])
 useEffect(() => { void load() }, [load])
 useEffect(() => { setQuery(''); setStatusFilter(''); setCustomerFilter(''); setCategoryFilter(''); setProductFilter(''); setMethodFilter('') }, [mode])
 async function run(operation: string, payload: Record<string, unknown>) {
  if (sending.current) return false
  sending.current = true; setBusy(true); setNotice('')
  const signature = JSON.stringify([operation, payload])
  if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() }
  try {
   await executeManagement(pending.current.key, operation, payload)
   pending.current = null; setNotice('Operação confirmada e registrada.'); await load(); return true
  } catch (e) { setNotice((e as Error).message); return false }
  finally { sending.current = false; setBusy(false) }
 }
 if (!data && loading) return <p className="state" role="status">Carregando gestão…</p>
 if (!data) return <section><h1 className="admin-h1">{titles[mode]}</h1><p role="alert">{error}</p><button className="btn btn-primary" onClick={() => void load()}>Tentar novamente</button></section>
 const customerName = (id: string) => data.customers.find(c => c.id === id)?.name ?? 'Cliente'
 const customerMatches = (id: string) => !customerFilter || id === customerFilter
 const filteredSales = data.sales.filter(s => customerMatches(s.customer_id) && withinPeriod(s.sold_at, start, end)
  && (!methodFilter || s.pricing_method === methodFilter || data.payments.some(p => p.sale_id === s.id && p.method === methodFilter))
  && (!statusFilter || (statusFilter === 'pending' ? Number(s.balance) > 0 : statusFilter === 'settled' ? Number(s.balance) === 0 && Number(s.remaining_units) > 0 : Number(s.remaining_units) === 0))
  && (!productFilter || data.sale_items.some(l => l.sale_id === s.id && l.product_id === productFilter))
  && (!categoryFilter || data.sale_items.some(l => l.sale_id === s.id && l.category_id === categoryFilter)))
 const filteredPayments = data.payments.filter(p => withinPeriod(p.received_at, start, end)
  && (!methodFilter || p.method === methodFilter)
  && data.sales.some(s => s.id === p.sale_id && customerMatches(s.customer_id)
   && (!productFilter || data.sale_items.some(l => l.sale_id === s.id && l.product_id === productFilter))
   && (!categoryFilter || data.sale_items.some(l => l.sale_id === s.id && l.category_id === categoryFilter))))
 const saleById = (id: string) => data.sales.find(s => s.id === id)
 const cashOut = data.payment_reversals.filter(r => withinPeriod(r.created_at, start, end) && data.payments.some(p => p.id === r.payment_id && (!methodFilter || p.method === methodFilter) && data.sales.some(s => s.id === p.sale_id && customerMatches(s.customer_id) && (!productFilter || data.sale_items.some(l => l.sale_id === s.id && l.product_id === productFilter)) && (!categoryFilter || data.sale_items.some(l => l.sale_id === s.id && l.category_id === categoryFilter)))))
 const cartTotal = cart.reduce((sum, l) => { const p = data.products.find(p => p.id === l.product_id); const cents = p ? toCents(p.promo_price ?? p.price) : 0; return sum + (pricing === 'pix' ? pixCents(cents) : cents) * l.quantity }, 0)
 const shownCustomers = data.customers.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase()) && (statusFilter === 'archived' ? c.archived_at : !c.archived_at))
 const shownProducts = data.products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()) && (!categoryFilter || p.category_id === categoryFilter)
  && (!statusFilter || (statusFilter === 'low' ? p.stock_quantity <= 2 : statusFilter === 'conditional' ? p.in_conditional > 0 : p.archived_at !== null)))
 const shownConditionals = data.conditionals.filter(c => customerMatches(c.customer_id) && withinPeriod(c.delivered_at, start, end) && (!statusFilter || (statusFilter === 'open' ? c.pending > 0 : c.pending === 0)))
 const stats = [
  ['Vendido no período (líquido de reversões)', formatBRL(filteredSales.reduce((sum, s) => sum + toCents(s.net_total), 0))],
  ['Recebimentos no período', formatBRL(filteredPayments.reduce((sum, p) => sum + toCents(p.amount), 0))],
  ['Estornos no período', formatBRL(cashOut.reduce((sum, r) => sum + toCents(r.amount ?? 0), 0))],
  ['A receber (vendas filtradas)', formatBRL(filteredSales.reduce((sum, s) => sum + toCents(s.balance), 0))],
  ['Recebido líquido no período', formatBRL(filteredPayments.reduce((n, p) => n + toCents(p.amount), 0) - cashOut.reduce((n, r) => n + toCents(r.amount ?? 0), 0))],
  ['Unidades devolvidas de vendas no período', data.sale_reversals.filter(r => withinPeriod(r.created_at, start, end) && data.sale_items.some(l => l.id === r.sale_item_id && (!productFilter || l.product_id === productFilter) && (!categoryFilter || l.category_id === categoryFilter) && data.sales.some(s => s.id === l.sale_id && customerMatches(s.customer_id)))).reduce((n, r) => n + Number(r.quantity ?? 0), 0)],
  ['Produtos com estoque baixo (até 2)', data.products.filter(p => p.is_active && !p.archived_at && p.stock_quantity <= 2).length],
  ['Vendas no período', filteredSales.length],
  ['Condicionais abertas', data.conditionals.filter(c => c.pending > 0 && customerMatches(c.customer_id)).length],
  ['Unidades disponíveis', data.products.reduce((sum, p) => sum + p.stock_quantity, 0)],
  ['Unidades em condicional', data.products.reduce((sum, p) => sum + Number(p.in_conditional), 0)],
 ]
 const openCart = (type: 'sale' | 'conditional', conditionalId = '') => {
  if (conditionalId && data.customers.some(c => c.id === data.conditionals.find(v => v.id === conditionalId)?.customer_id && c.archived_at)) { setNotice('Reative o cliente arquivado antes de registrar uma nova venda. Retornos continuam disponíveis.'); return }
  setNotice(''); setCartType(type); setCartConditional(conditionalId); setCartCustomer(data.conditionals.find(c => c.id === conditionalId)?.customer_id ?? '')
  setCart([]); setPricing('card'); setPaymentMethod('card'); setTerms('immediate')
 }
 const filters = <div className="management-filters">
  <label className="field">Cliente<select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}><option value="">Todos</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label className="field">De<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
  <label className="field">Até<input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} /></label>
 </div>
 const saleCard = (s: Sale) => <article className="management-card" key={s.id}>
  <h2>{s.customer_name || 'Nome histórico não registrado'} <small>· {date(s.sold_at)}</small></h2>
  <p>{s.conditional_id ? 'Venda de condicional' : 'Venda direta'} · {label(s.pricing_method)} · {label(s.collection_terms)}</p>
  <p>Vendido líquido: <b>{money(s.net_total)}</b> · A receber: <b>{money(s.balance)}</b> · {Number(s.remaining_units) === 0 ? 'Cancelada/devolvida integralmente' : Number(s.balance) > 0 ? 'Pendente' : 'Quitada'}</p>
  {s.due_at && <p>Vencimento: {date(s.due_at)}</p>}
  <ul>{data.sale_items.filter(l => l.sale_id === s.id).map(l => <li key={l.id} className="management-line">
   <span>{l.product_name} · {l.quantity} × {money(l.unit_price)} · Revertidas: {l.reversed}</span>
   {l.quantity > l.reversed && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openAction({ action: 'sale_reverse', id: l.id, title: `Devolver/cancelar: ${l.product_name}`, max: l.quantity - l.reversed })}>Devolver peças</button>}
  </li>)}</ul>
  {Number(s.balance) > 0 && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => openAction({ action: 'payment_add', id: s.id, title: `Receber de ${s.customer_name || 'Nome histórico não registrado'}`, amount: Number(s.balance) })}>Registrar recebimento</button>}
  {Number(s.remaining_units) > 0 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openAction({ action: 'sale_cancel', id: s.id, title: 'Cancelar/devolver toda a venda' })}>Cancelar venda inteira</button>}
 </article>

 async function saveCustomer(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); const f = new FormData(e.currentTarget)
  if (await run('customer_save', { id: editing === 'new' ? undefined : editing?.id, name: f.get('name'), phone: f.get('phone'), notes: f.get('notes'), archived: f.get('archived') === 'on' })) setEditing(null)
 }
 async function saveCart(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); const f = new FormData(e.currentTarget)
  const received = terms === 'immediate' ? cartTotal / 100 : parseBRLInput(String(f.get('received') ?? '0'))
  if (!cart.length || !Number.isSafeInteger(cartTotal) || (cartType === 'sale' && received === null)) { setNotice('Confira os itens e o valor recebido.'); return }
  const due = String(f.get('due') ?? '')
  const payload = { customer_id: cartCustomer, conditional_id: cartConditional || undefined, items: cart,
   due_at: due ? new Date(`${due}T23:59:59`).toISOString() : undefined, notes: f.get('notes'),
   pricing_method: pricing, collection_terms: terms, received: terms === 'immediate' ? cartTotal / 100 : (received ?? 0) / 100, payment_method: f.get('payment_method') }
  if (await run(cartType === 'conditional' ? 'conditional_deliver' : 'sale_create', payload)) setCartType(null)
 }
 async function saveAction(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); if (!action) return
  const f = new FormData(e.currentTarget); const quantity = Number(f.get('quantity')); const cents = parseBRLInput(String(f.get('amount') ?? ''))
  let payload: Record<string, unknown> = { reason: f.get('reason') }
  switch (action.action) {
   case 'stock_adjust': payload = { ...payload, product_id: action.id, delta: Number(f.get('delta')), kind: f.get('kind') }; break
   case 'conditional_resolve': payload = { ...payload, item_id: action.id, quantity, kind: f.get('kind') }; break
   case 'conditional_reverse': payload = { ...payload, event_id: action.id }; break
   case 'sale_reverse': payload = { ...payload, item_id: action.id, quantity, restock: f.get('restock') === 'on', refund_confirmed: f.get('refund_confirmed') === 'on' }; break
   case 'sale_cancel': payload = { ...payload, sale_id: action.id, restock: f.get('restock') === 'on', refund_confirmed: f.get('refund_confirmed') === 'on' }; break
   case 'payment_add': case 'payment_reverse':
    if (cents === null || cents <= 0) { setNotice('Informe um valor monetário válido.'); return }
    payload = { ...payload, [action.action === 'payment_add' ? 'sale_id' : 'payment_id']: action.id, amount: cents / 100, method: f.get('method'), received_at: f.get('received_at') ? new Date(String(f.get('received_at'))).toISOString() : undefined }; break
  }
  if (await run(action.action, payload)) setAction(null)
 }
 return <section>
  <div className="admin-head"><h1 className="admin-h1">{titles[mode]}</h1><button className="btn btn-ghost btn-sm" disabled={busy || loading} onClick={() => void load()}>Atualizar dados</button></div>
  {notice && <p className="notice-box" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  {loading && <p role="status">Atualizando…</p>}
  {['dashboard', 'conditionals', 'sales', 'payments', 'reports'].includes(mode) && filters}
  {['dashboard', 'reports', 'sales', 'payments'].includes(mode) && <div className="management-filters">
   <label className="field">Produto<select value={productFilter} onChange={e => setProductFilter(e.target.value)}><option value="">Todos</option>{data.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="field">Categoria<select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">Todas</option>{[...new Map(data.products.map(p => [p.category_id, p.category])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
   <label className="field">Forma<select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}><option value="">Todas</option>{['pix', 'card', 'cash', 'bank_transfer'].map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
   <label className="field">Situação das vendas<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todas</option><option value="pending">A receber</option><option value="settled">Quitadas</option><option value="cancelled">Canceladas/devolvidas</option></select></label>
  </div>}
  {['dashboard', 'reports'].includes(mode) && <><div className="stats">{stats.map(([title, value]) => <div className="stat" key={String(title)}><span>{title}</span><b>{value}</b></div>)}</div>
   <p className="fine">Vendido é o valor atual das vendas do período, descontadas suas reversões. Recebimentos e estornos seguem suas próprias datas. Os saldos não representam lucro.</p>
   <div className="form-actions"><button className="btn btn-ghost" onClick={() => exportCSV('vendas.csv', [['Data', 'Cliente (snapshot)', 'Origem', 'Preço', 'Prazo', 'Vendido líquido', 'Saldo'], ...filteredSales.map(s => [s.sold_at, s.customer_name || 'Nome histórico não registrado', s.conditional_id ? 'Condicional' : 'Direta', label(s.pricing_method), label(s.collection_terms), s.net_total, s.balance])])}>Exportar vendas CSV</button>
   <button className="btn btn-ghost" onClick={() => exportCSV('recebimentos.csv', [['Data', 'Cliente', 'Método', 'Recebido bruto', 'Estornado acumulado'], ...filteredPayments.map(p => [p.received_at, saleById(p.sale_id)?.customer_name, label(p.method), p.amount, p.reversed])])}>Exportar recebimentos CSV</button>
   <button className="btn btn-ghost" onClick={() => exportCSV('estornos.csv', [['Data', 'Recebimento', 'Valor', 'Motivo'], ...cashOut.map(r => [r.created_at, r.payment_id, r.amount, r.reason])])}>Exportar estornos CSV</button></div>
   <h2>Vendas filtradas</h2>{filteredSales.map(saleCard)}{!filteredSales.length && <p className="state">Nenhuma venda neste filtro.</p>}</>}
  {mode === 'customers' && <>
   <div className="management-filters"><label className="field">Pesquisar nome/telefone<input value={query} onChange={e => setQuery(e.target.value)} /></label><label className="field">Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Ativos</option><option value="archived">Arquivados</option></select></label><button className="btn btn-primary" onClick={() => { setNotice(''); setEditing('new') }}>Cadastrar cliente</button></div>
   {shownCustomers.map(c => <article className="management-card" key={c.id}><h2>{c.name}</h2><p>{c.phone || 'Sem telefone'} · {c.archived_at ? 'Arquivado' : 'Ativo'}</p><p className="preserve-lines">{c.notes}</p><button className="btn btn-ghost btn-sm" onClick={() => { setNotice(''); setEditing(c) }}>Editar</button><button className="btn btn-ghost btn-sm" onClick={() => setHistory(history === c.id ? '' : c.id)}>Histórico</button><button className="btn btn-ghost btn-sm" onClick={() => setRecordAction({ kind: 'customer', id: c.id, name: c.name, archived: Boolean(c.archived_at), intent: 'archive' })}>{c.archived_at ? 'Reativar' : 'Arquivar'}</button><button className="btn btn-ghost btn-sm" onClick={() => setRecordAction({ kind: 'customer', id: c.id, name: c.name, archived: Boolean(c.archived_at), intent: 'delete' })}>Excluir cliente</button>
    {history === c.id && <div><h3>Vendas e saldo</h3>{data.sales.filter(s => s.customer_id === c.id).map(saleCard)}<h3>Condicionais</h3>{data.conditionals.filter(v => v.customer_id === c.id).map(v => <p key={v.id}>{date(v.delivered_at)} · {v.pending} peças pendentes · Cliente na entrega: {v.customer_name || c.name}</p>)}<h3>Recebimentos</h3>{data.payments.filter(p => saleById(p.sale_id)?.customer_id === c.id).map(p => <p key={p.id}>{date(p.received_at)} · {label(p.method)} · {money(p.amount)} · Estornado: {money(p.reversed)}</p>)}<h3>Auditoria do cadastro</h3>{data.customer_audit.filter(a => a.customer_id === c.id).map(a => <p key={a.id}>{date(a.created_at)} · {a.action}</p>)}</div>}
   </article>)}{!shownCustomers.length && <p className="state">Nenhum cliente neste filtro.</p>}
  </>}
  {mode === 'stock' && <>
   <div className="management-filters"><label className="field">Pesquisar produto/categoria<input value={query} onChange={e => setQuery(e.target.value)} /></label><label className="field">Filtro<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todos</option><option value="low">Estoque baixo (até 2)</option><option value="conditional">Em condicional</option><option value="archived">Arquivados</option></select></label><button className="btn btn-ghost" onClick={() => exportCSV('estoque.csv', [['Produto', 'Categoria', 'Disponível', 'Em condicional', 'Físico total em posse da loja/clientes'], ...shownProducts.map(p => [p.name, p.category, p.stock_quantity, p.in_conditional, p.stock_quantity + Number(p.in_conditional)])])}>Exportar estoque CSV</button></div>
   <p className="fine">Disponível: peças na loja. Em condicional: peças com clientes ainda sem destino. Total físico sob controle da loja = disponível + pendente em condicional.</p>
   {shownProducts.map(p => <article className="management-card" key={p.id}><h2>{p.name}</h2><p>{p.category} · Disponível: <b>{p.stock_quantity}</b> · Em condicional: <b>{p.in_conditional}</b> · Total físico: {p.stock_quantity + Number(p.in_conditional)}</p><button className="btn btn-ghost btn-sm" onClick={() => openAction({ action: 'stock_adjust', id: p.id, title: `Ajustar estoque: ${p.name}` })}>Entrada / ajuste / perda</button><details><summary>Histórico de movimentos</summary>{data.movements.filter(m => m.product_id === p.id).map(m => <p key={m.id}>{date(m.created_at)} · {m.movement_type} · {m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta} · Saldo: {m.quantity_after} · {m.origin}</p>)}{data.events.filter(e => data.conditional_items.some(i => i.id === e.conditional_item_id && i.product_id === p.id)).map(e => <p key={e.id}>{date(e.created_at)} · Condicional: {label(e.kind)} · {e.quantity} · {e.reason} (destino físico; sem nova baixa)</p>)}</details></article>)}{!shownProducts.length && <p className="state">Nenhum produto neste filtro.</p>}
  </>}
  {mode === 'conditionals' && <>
   <div className="management-filters"><button className="btn btn-primary" onClick={() => openCart('conditional')}>Preparar entrega física</button><label className="field">Estado<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todos</option><option value="open">Em andamento</option><option value="closed">Concluídas</option></select></label></div>
   {shownConditionals.map(c => <article className="management-card" key={c.id}><h2>{c.customer_name || customerName(c.customer_id)}</h2><p>{date(c.delivered_at)} · {c.pending > 0 ? `${c.pending} peças pendentes` : 'Concluída: todas as peças têm destino'} · Prazo: {date(c.due_at)}</p><p>{c.notes}</p>{c.pending > 0 && <button className="btn btn-primary btn-sm" onClick={() => openCart('sale', c.id)}>Registrar compra parcial ou total</button>}
    {data.conditional_items.filter(i => i.conditional_id === c.id).map(i => <div key={i.id} className="management-line"><span>{i.product_name} · Entregues: {i.quantity_out} · Pendentes: {i.pending}
      {(() => { const events = data.events.filter(e => e.conditional_item_id === i.id && e.kind !== 'reversal' && !data.events.some(v => v.reverses_event_id === e.id)); const sold = events.filter(e => e.kind === 'sale').reduce((n, e) => n + e.quantity, 0); const reversed = data.sale_items.filter(l => data.sales.some(s => s.id === l.sale_id && s.conditional_id === c.id) && l.product_id === i.product_id).reduce((n, l) => n + l.reversed, 0); return ` · Compradas: ${sold - reversed} · Devolvidas: ${events.filter(e => e.kind === 'return').reduce((n, e) => n + e.quantity, 0) + reversed} · Perdidas/danificadas: ${events.filter(e => e.kind === 'loss').reduce((n, e) => n + e.quantity, 0)}` })()}
     </span>{i.pending > 0 && <button className="btn btn-ghost btn-sm" onClick={() => openAction({ action: 'conditional_resolve', id: i.id, title: `Retorno/perda: ${i.product_name}`, max: i.pending })}>Registrar destino</button>}
     <details><summary>Eventos e correções</summary>{data.events.filter(e => e.conditional_item_id === i.id).map(e => <p key={e.id}>{date(e.created_at)} · {label(e.kind)} · {e.quantity} · {e.reason}{['return', 'loss'].includes(e.kind) && !data.events.some(v => v.reverses_event_id === e.id) && <button className="link" onClick={() => openAction({ action: 'conditional_reverse', id: e.id, title: 'Desfazer evento da condicional' })}>Desfazer com motivo</button>}</p>)}</details>
    </div>)}
   </article>)}{!shownConditionals.length && <p className="state">Nenhuma condicional neste filtro.</p>}
  </>}
  {mode === 'sales' && <><button className="btn btn-primary" onClick={() => openCart('sale')}>Registrar venda direta</button>{filteredSales.map(saleCard)}{!filteredSales.length && <p className="state">Nenhuma venda neste filtro.</p>}</>}
  {mode === 'payments' && <><h2>Contas a receber</h2>{filteredSales.filter(s => Number(s.balance) > 0).map(saleCard)}{!filteredSales.some(s => Number(s.balance) > 0) && <p className="state">Nenhum saldo a receber neste filtro.</p>}<h2>Recebimentos</h2>{filteredPayments.map(p => <article className="management-card" key={p.id}><h3>{saleById(p.sale_id)?.customer_name || 'Cliente'} · {label(p.method)}</h3><p>{date(p.received_at)} · Recebido: {money(p.amount)} · Estornado: {money(p.reversed)}</p>{Number(p.amount) > Number(p.reversed) && <button className="btn btn-ghost btn-sm" onClick={() => openAction({ action: 'payment_reverse', id: p.id, title: 'Estornar recebimento', amount: (toCents(p.amount) - toCents(p.reversed)) / 100 })}>Estornar com motivo</button>}{data.payment_reversals.filter(r => r.payment_id === p.id).map(r => <p key={r.id}>{date(r.created_at)} · Estorno {money(r.amount ?? 0)} · {r.reason}</p>)}</article>)}</>}

  <RecordActionDialog target={recordAction} onClose={() => setRecordAction(null)} onDone={async message => { setRecordAction(null); setHistory(''); setNotice(message); await load() }} />
  <Dialog open={editing !== null} onClose={() => { if (!busy) setEditing(null) }} label="Cadastro de cliente" className="modal">
   {editing && <form className="pform" onSubmit={e => void saveCustomer(e)} key={editing === 'new' ? 'new' : editing.id}><h2>{editing === 'new' ? 'Cadastrar cliente' : 'Editar cliente'}</h2>
    {notice && <p className="notice-box" role="alert">{notice}</p>}
    <label className="field">Nome<input name="name" required maxLength={120} defaultValue={editing === 'new' ? '' : editing.name} /></label>
    <label className="field">Telefone (opcional)<input name="phone" type="tel" maxLength={32} defaultValue={editing === 'new' ? '' : editing.phone} /></label>
    <label className="field">Observações privadas<textarea name="notes" maxLength={2000} defaultValue={editing === 'new' ? '' : editing.notes} /></label>
    {editing !== 'new' && <label className="check"><input type="checkbox" name="archived" defaultChecked={Boolean(editing.archived_at)} /> Arquivado (histórico preservado)</label>}
    <p className="fine">Cadastros editados não alteram o nome histórico das novas vendas e entregas já confirmadas.</p>
    <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar cliente'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
   </form>}
  </Dialog>
  <Dialog open={cartType !== null} onClose={() => { if (!busy) setCartType(null) }} label="Preparar operação" className="modal">
   {cartType && <form className="pform" onSubmit={e => void saveCart(e)}><h2>{cartType === 'conditional' ? 'Confirmar entrega física' : cartConditional ? 'Venda de condicional' : 'Venda direta'}</h2>{notice && <p className="notice-box" role="alert">{notice}</p>}
    <label className="field">Cliente<select required value={cartCustomer} disabled={Boolean(cartConditional)} onChange={e => setCartCustomer(e.target.value)}><option value="">Selecione</option>{data.customers.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">Adicionar produto<select value="" onChange={e => { if (e.target.value && !cart.some(l => l.product_id === e.target.value)) setCart([...cart, { product_id: e.target.value, quantity: 1 }]) }}><option value="">Selecione</option>{data.products.filter(p => !p.archived_at && (cartConditional ? data.conditional_items.some(i => i.conditional_id === cartConditional && i.product_id === p.id && i.pending > 0) : p.is_active && p.stock_quantity > 0)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {cart.map(l => { const p = data.products.find(p => p.id === l.product_id)!; const max = cartConditional ? data.conditional_items.find(i => i.conditional_id === cartConditional && i.product_id === l.product_id)?.pending ?? 0 : p.stock_quantity; return <div className="management-line" key={l.product_id}><label className="field">{p.name} (máximo atual {max})<input type="number" required min={1} max={max} value={l.quantity} onChange={e => setCart(cart.map(v => v.product_id === l.product_id ? { ...v, quantity: Number(e.target.value) } : v))} /></label><button className="link" type="button" onClick={() => setCart(cart.filter(v => v.product_id !== l.product_id))}>Remover</button></div> })}
    {cartType === 'sale' && <><label className="field">Preço<select value={pricing} onChange={e => { setPricing(e.target.value); setPaymentMethod(e.target.value === 'pix' ? 'pix' : e.target.value === 'card' ? 'card' : 'cash') }}><option value="card">Cartão — preço integral</option><option value="pix">Pix — 10% acumulativo</option><option value="standard">Dinheiro/transferência — preço integral</option></select></label>
     <p>Total estimado: <b>{formatBRL(cartTotal)}</b></p>
     <label className="field">Condição de recebimento<select value={terms} onChange={e => setTerms(e.target.value)}><option value="immediate">À vista (recebimento integral)</option><option value="store_credit">Crédito concedido pela loja (permite parcial)</option></select></label>
     <label className="field">Método do recebimento<select name="payment_method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{['pix', 'card', 'cash', 'bank_transfer'].map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
     {terms === 'store_credit' && <label className="field">Recebido agora (R$; zero se nada entrou)<input name="received" defaultValue="0" required inputMode="decimal" /></label>}
     <p className="fine">Cartão parcelado pela operadora não cria crédito da loja automaticamente. Preço é conferido no banco; se mudou, atualize antes de confirmar.</p>
    </>}
    {(cartType === 'conditional' || terms === 'store_credit') && <label className="field">Prazo (opcional)<input type="date" name="due" min={new Date().toLocaleDateString('sv-SE')} /></label>}
    <label className="field">Observações<textarea name="notes" maxLength={2000} /></label>
    <label className="check"><input type="checkbox" required /> {cartType === 'conditional' ? 'Confirmo que estas peças estão sendo entregues fisicamente à cliente.' : 'Conferi as peças, o preço e o recebimento informado.'}</label>
    <button className="btn btn-primary" disabled={busy || !cart.length || !cartCustomer}>{busy ? 'Confirmando…' : 'Confirmar e registrar'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCartType(null)}>Cancelar preparação</button>
   </form>}
  </Dialog>
  <Dialog open={action !== null} onClose={() => { if (!busy) setAction(null) }} label={action?.title ?? 'Operação'} className="modal">
   {action && <form className="pform" onSubmit={e => void saveAction(e)} key={`${action.action}:${action.id}`}><h2>{action.title}</h2>{notice && <p className="notice-box" role="alert">{notice}</p>}
    {action.max !== undefined && <label className="field">Quantidade<input name="quantity" type="number" required min={1} max={action.max} defaultValue={1} /></label>}
    {action.action === 'stock_adjust' && <><label className="field">Tipo<select name="kind"><option value="entry">Entrada</option><option value="adjust">Ajuste</option><option value="loss">Perda/dano</option></select></label><label className="field">Variação (use número negativo para saída/perda)<input name="delta" type="number" required step={1} /></label></>}
    {action.action === 'conditional_resolve' && <label className="field">Destino<select name="kind"><option value="return">Retorno físico à loja</option><option value="loss">Perda/dano — sem retorno ao disponível</option></select></label>}
    {action.amount !== undefined && <label className="field">Valor em R$ (máximo {money(action.amount)})<input name="amount" required inputMode="decimal" /></label>}
    {action.action === 'payment_add' && <><label className="field">Método<select name="method">{['pix', 'card', 'cash', 'bank_transfer'].map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label><label className="field">Data do recebimento (vazio = agora)<input type="datetime-local" name="received_at" /></label></>}
    <label className="field">Motivo / observação<input name="reason" minLength={3} maxLength={2000} required={action.action !== 'payment_add'} /></label>
    {['sale_reverse', 'sale_cancel'].includes(action.action) && <><label className="check"><input name="restock" type="checkbox" required /> Confirmo que todas as peças indicadas voltaram fisicamente à loja.</label><p className="fine">O registro original será mantido. Se houver recebimento excedente, a devolução financeira da diferença será registrada junto: registre somente após devolver esse valor à cliente.</p><label className="check"><input name="refund_confirmed" type="checkbox" required /> Confirmo que realizei a devolução financeira de eventual valor excedente.</label></>}
    {action.action === 'payment_reverse' && <p className="fine">Estornar reduz o recebido e pode reabrir saldo a receber. Não apaga a venda nem repõe estoque.</p>}
    <button className="btn btn-primary" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar registro'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setAction(null)}>Cancelar</button>
   </form>}
  </Dialog>
 </section>
}
