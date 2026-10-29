import { useState } from 'react'
import ConditionalReview from './ConditionalReview'
import Dialog from './Dialog'
import ProductImage from './ProductImage'
import { formatBRL, toCents, pixCents } from '../lib/money'
import { describeChange, totalCents } from '../lib/selection'
import { useSelection } from '../lib/SelectionContext'
import type { CatalogProduct } from '../lib/types'

interface Props { open: boolean; onClose: () => void; products: CatalogProduct[] }

export default function SelectionDrawer({ open, onClose, products }: Props) {
  const { selection, count, notices, setQty, remove, clear, dismissNotices } = useSelection()
  const [step, setStep] = useState<'lista' | 'revisao'>('lista')
  const byId = new Map(products.map(p => [p.id, p]))
  const lines = Object.keys(selection).map(id => byId.get(id)).filter((p): p is CatalogProduct => Boolean(p))
  const unit: Record<string, number> = {}
  for (const p of lines) unit[p.id] = toCents(p.current_price)
  const total = totalCents(selection, unit)
  const pixUnit = Object.fromEntries(Object.entries(unit).map(([id, cents]) => [id, pixCents(cents)]))
  const pixTotal = totalCents(selection, pixUnit)

  const close = () => { setStep('lista'); onClose() }

  return (
    <Dialog open={open} onClose={close} label="Minha seleção" className="drawer">
      {step === 'revisao' ? (
        <ConditionalReview onBack={() => setStep('lista')} onClose={close} />
      ) : (
        <>
          <div className="dr-head">
            <h2>Minha seleção <small>({count} {count === 1 ? 'peça' : 'peças'})</small></h2>
            <button className="btn btn-ghost btn-sm" onClick={close}>Fechar</button>
          </div>
          {notices.length > 0 && (
            <div className="notice-box" role="alert">
              <p><b>Atualizamos a sua seleção:</b></p>
              <ul>{notices.map((c, i) => <li key={i}>{describeChange(c)}</li>)}</ul>
              <button className="btn btn-ghost btn-sm" onClick={dismissNotices}>Entendi</button>
            </div>
          )}
          {lines.length === 0 ? (
            <div className="dr-body"><div className="empty-dr">
              <p>Você ainda não escolheu nenhuma peça.</p>
              <button className="btn btn-primary" onClick={close}>Ver joias</button>
            </div></div>
          ) : (
            <>
              <div className="dr-body">
                <ul>
                  {lines.map(p => (
                    <li className="line" key={p.id}>
                      <div className="line-img"><ProductImage path={p.image_paths[0]} alt="" /></div>
                      <div>
                        <p className="line-name">{p.name}</p>
                        <p className="line-unit">{formatBRL(unit[p.id])} cada no cartão · {formatBRL(pixUnit[p.id])} cada no Pix</p>
                        <div className="qty">
                          <button onClick={() => setQty(p.id, selection[p.id] - 1, p.available_quantity)} aria-label={`Diminuir quantidade de ${p.name}`}>−</button>
                          <span aria-label="Quantidade">{selection[p.id]}</span>
                          <button onClick={() => setQty(p.id, selection[p.id] + 1, p.available_quantity)}
                            disabled={selection[p.id] >= p.available_quantity}
                            aria-label={`Aumentar quantidade de ${p.name}`}>+</button>
                        </div>
                        {selection[p.id] >= p.available_quantity && <p className="fine">Máximo disponível no momento.</p>}
                      </div>
                      <div className="line-side">
                        <p className="line-total">{formatBRL(unit[p.id] * selection[p.id])} no cartão</p>
                        <p className="fine">{formatBRL(pixUnit[p.id] * selection[p.id])} no Pix</p>
                        <button className="link" onClick={() => remove(p.id)}>Remover</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="dr-foot">
                <div className="sub"><span>Total estimado no cartão</span><b>{formatBRL(total)}</b></div>
                <div className="sub"><span>Total estimado no Pix (10%)</span><b>{formatBRL(pixTotal)}</b></div>
                <p className="fine">
                  Montar a seleção não é uma compra e não reserva as peças. Na próxima etapa você confere tudo
                  antes de abrir o WhatsApp.
                </p>
                <button className="btn btn-primary" onClick={() => setStep('revisao')}>Revisar e solicitar condicional</button>
                <button className="link" style={{ alignSelf: 'center' }} onClick={clear}>Esvaziar seleção</button>
              </div>
            </>
          )}
        </>
      )}
    </Dialog>
  )
}
