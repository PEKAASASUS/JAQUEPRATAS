import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Dialog from '../components/Dialog'
import { executeManagement, loadManagement, type Snapshot } from './services'
import type { AdminProduct } from '../lib/types'

export default function ProductStockDialog({ product, onClose, onChanged }: {
  product: AdminProduct; onClose: () => void; onChanged: () => Promise<void>
}) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const pending = useRef<{ signature: string; key: string } | null>(null)
  const load = useCallback(async () => {
    setError('')
    try { setData(await loadManagement()) }
    catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])
  const current = data?.products.find(p => p.id === product.id)
  const movements = data?.movements.filter(m => m.product_id === product.id) ?? []
  const events = data?.events.filter(e => data.conditional_items.some(i => i.id === e.conditional_item_id && i.product_id === product.id)) ?? []
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sending.current) return
    const form = e.currentTarget
    const fields = new FormData(form)
    const payload = { product_id: product.id, kind: fields.get('kind'), delta: Number(fields.get('delta')), reason: fields.get('reason') }
    if (!Number.isSafeInteger(payload.delta) || payload.delta === 0) { setNotice('Informe uma variação inteira diferente de zero.'); return }
    const signature = JSON.stringify(payload)
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() }
    sending.current = true; setBusy(true); setNotice('')
    try {
      await executeManagement(pending.current.key, 'stock_adjust', payload)
      pending.current = null
      form.reset()
      setNotice('Operação confirmada e registrada.')
      await Promise.all([load(), onChanged()])
    } catch (e) { setNotice((e as Error).message) }
    finally { sending.current = false; setBusy(false) }
  }
  return <Dialog open onClose={() => { if (!sending.current) onClose() }} label={`Movimentações: ${product.name}`} className="modal">
    <div className="pform">
      <h2>Movimentações: {product.name}</h2>
      {error && <div role="alert"><p>{error}</p><button className="btn btn-ghost" disabled={busy} onClick={() => void load()}>Tentar novamente</button></div>}
      {!data && !error && <p role="status">Carregando movimentações…</p>}
      {data && !current && <p role="alert">Produto não encontrado. Feche e atualize a lista.</p>}
      {current && <>
        <p>Disponível: <b>{current.stock_quantity}</b> · Em condicional: <b>{current.in_conditional}</b> · Total físico: {current.stock_quantity + Number(current.in_conditional)}</p>
        <p className="fine">Total físico = disponível na loja + peças com clientes ainda pendentes em condicional.</p>
        <form onSubmit={e => void save(e)}>
          <fieldset className="stock-fields" disabled={busy}>
            <legend>Entrada / ajuste / perda</legend>
            <label className="field">Tipo<select name="kind"><option value="entry">Entrada</option><option value="adjust">Ajuste</option><option value="loss">Perda/dano</option></select></label>
            <label className="field">Variação (use número negativo para saída/perda)<input name="delta" type="number" required step={1} /></label>
            <label className="field">Motivo / observação<input name="reason" minLength={3} maxLength={2000} required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar registro'}</button>
          </fieldset>
        </form>
        <details><summary>Histórico de movimentos</summary>
          {movements.map(m => <p key={m.id}>{new Date(m.created_at).toLocaleString('pt-BR')} · {m.movement_type} · {m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta} · Saldo: {m.quantity_after} · {m.origin}</p>)}
          {events.map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString('pt-BR')} · Condicional: {e.kind} · {e.quantity} · {e.reason} (destino físico; sem nova baixa)</p>)}
          {!movements.length && !events.length && <p>Nenhuma movimentação registrada.</p>}
        </details>
      </>}
      {notice && <p className="notice-box" role="status">{notice}</p>}
      <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Fechar</button>
    </div>
  </Dialog>
}
